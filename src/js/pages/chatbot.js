import { createChat } from '../components/chat.js';
import { createDateRange } from '../components/date-range.js';
import { renderIcons } from '../components/icons.js';
import { mountLayout } from '../components/layout.js';
import { modelUsageHtml } from '../components/model-usage.js';
import { createTrendChart } from '../components/trend-chart.js';
import { errorState, segmentedHtml, statTile } from '../components/ui.js';
import { api } from '../services/api.js';
import {
  activeConversation, CHATS_CHANGED, deleteConversation, listConversations, setActiveConversation, startNewConversation,
} from '../services/chat-store.js';
import { summarizeChat } from '../services/selectors.js';
import { $, esc, getParam, setParams } from '../utils/dom.js';
import { fmtCompact, fmtDateTime, fmtInt, fmtPct, fmtRelative, fmtRupiah, fmtTime } from '../utils/format.js';
import { rangeQuery } from '../utils/range.js';

mountLayout({ page: 'chatbot' });

const chat = createChat(document.getElementById('main-chat'), { variant: 'full', autoFocus: true });

const panel = $('[data-history-panel]');
const openButton = $('[data-history-open]');

const dayFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

// Riwayat dikelompokkan per bulan; bulan berjalan tanpa judul kelompok.
function renderHistory() {
  const list = listConversations();
  const active = activeConversation()?.id;
  const thisMonth = monthFmt.format(new Date());
  if (!list.length) {
    $('[data-history]').innerHTML = '<p class="px-3 py-2 text-mid-gray">Belum ada percakapan.</p>';
    return;
  }
  const groups = new Map();
  for (const c of list) {
    const key = monthFmt.format(new Date(c.updatedAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  $('[data-history]').innerHTML = [...groups.entries()]
    .map(([month, items]) => `
      <div class="mb-3">
        ${month === thisMonth ? '' : `<p class="label-caps px-3 pt-2 pb-1">${esc(month)}</p>`}
        <ul>
          ${items
            .map(
              (c) => `<li class="group relative">
                <button type="button" data-conv="${c.id}" aria-current="${c.id === active}"
                  class="w-full cursor-pointer rounded-nested px-3 py-2.5 pr-9 text-left transition-colors hover:bg-canvas ${c.id === active ? 'bg-canvas' : ''}">
                  <span class="block truncate font-medium">${esc(c.title)}</span>
                  <span class="block text-caption tracking-normal text-mid-gray">${dayFmt.format(new Date(c.updatedAt))}</span>
                </button>
                <button type="button" data-delete="${c.id}" aria-label="Hapus percakapan ${esc(c.title)}"
                  class="btn btn-ghost btn-icon absolute top-2.5 right-1 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><i data-lucide="x" class="size-3.5"></i></button>
              </li>`,
            )
            .join('')}
        </ul>
      </div>`)
    .join('');
  renderIcons($('[data-history]'));
}

function setPanel(open) {
  panel.classList.toggle('hidden', !open);
  panel.classList.toggle('flex', open);
  openButton.setAttribute('aria-expanded', String(open));
}

$('[data-history]').addEventListener('click', (e) => {
  const del = e.target.closest('[data-delete]');
  if (del) return deleteConversation(del.dataset.delete);
  const item = e.target.closest('[data-conv]');
  if (!item) return;
  setActiveConversation(item.dataset.conv);
  if (window.matchMedia('(max-width: 1023px)').matches) setPanel(false);
});
$('[data-new-chat]').addEventListener('click', () => {
  startNewConversation();
  if (window.matchMedia('(max-width: 1023px)').matches) setPanel(false);
});
openButton.addEventListener('click', () => setPanel(true));
$('[data-history-close]').addEventListener('click', () => setPanel(false));

window.addEventListener(CHATS_CHANGED, renderHistory);
renderHistory();
renderIcons($('main'));

/* ------------------------------- analitik ------------------------------- */

const VIEWS = [{ value: 'chat', label: 'Percakapan' }, { value: 'analytics', label: 'Analitik' }];
const analytics = { data: null, summary: null, trend: 'questions', search: '', chatFilter: 'all', chart: null, timer: null };

// Satu grafik, tiga pilihan data. Satu seri per pilihan supaya tidak ada dua skala di satu sumbu.
const TRENDS = [
  { value: 'questions', label: 'Pertanyaan', desc: 'Jumlah pertanyaan', key: 'questions', format: (v) => `${fmtInt(v)} pertanyaan` },
  { value: 'tokens', label: 'Token', desc: 'Token masuk dan keluar', key: 'tokens', format: (v) => `${fmtCompact(v)} token` },
  { value: 'cost', label: 'Biaya', desc: 'Estimasi biaya model AI', key: 'rupiah', format: (v) => fmtRupiah(v) },
];

const picker = createDateRange($('[data-range]'), {
  onChange: async () => {
    analytics.chatFilter = 'all';
    await loadAnalytics();
  },
});

const CHAT_FILTERS = [{ value: 'all', label: 'Semua' }, { value: 'down', label: 'Tidak sesuai' }];

function currentView() {
  return location.hash === '#analitik' ? 'analytics' : 'chat';
}

function showView() {
  const view = currentView();
  $('[data-view-tabs]').innerHTML = segmentedHtml(VIEWS, view, 'data-view-id');
  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('hidden', el.dataset.view !== view));
  clearInterval(analytics.timer);
  $('[data-updated]').textContent = '';
  if (view === 'analytics') {
    loadAnalytics();
    analytics.timer = setInterval(loadAnalytics, 15000);
  }
}

$('[data-view-tabs]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view-id]');
  if (!btn) return;
  history.replaceState(null, '', btn.dataset.viewId === 'analytics' ? '#analitik' : location.pathname + location.search);
  showView();
});
window.addEventListener('hashchange', showView);

async function loadAnalytics() {
  const range = picker.range;
  try {
    const data = await api.getChatAnalytics({ ...rangeQuery(range), rating: analytics.chatFilter === 'down' ? 'down' : null });
    // Rentang sudah diganti lagi selama memuat: hasil ini sudah basi.
    if (picker.range.label !== range.label) return;
    analytics.data = data;
    renderAnalytics();
  } catch (err) {
    $('[data-chat-kpis]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat analitik: ${err.message}`)}</div>`;
  }
}

function renderAnalytics() {
  const range = picker.range;
  const s = summarizeChat(analytics.data, range);
  analytics.summary = s;
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(analytics.data.updatedAt)}`;
  $('[data-chat-kpis]').innerHTML = [
    statTile({ label: 'Pengguna', value: fmtInt(s.users), unit: ' orang', sub: `Bertanya ${range.short}` }),
    statTile({ label: 'Pertanyaan', value: fmtInt(s.questions), sub: range.label }),
    statTile({ label: 'Biaya AI', value: fmtRupiah(s.rupiah), sub: `${fmtCompact(s.tokens)} token` }),
    statTile({ label: 'Jawaban sesuai', value: s.rated ? fmtPct(s.upRate) : '–', sub: `Dari ${fmtInt(s.rated)} ulasan` }),
  ].join('');
  renderTrend();
  $('[data-model-desc]').textContent = range.label;
  $('[data-model-usage]').innerHTML = modelUsageHtml(s);
  renderUsers();
  renderChats();
}

function renderTrend() {
  const s = analytics.summary;
  const range = picker.range;
  const t = TRENDS.find((x) => x.value === analytics.trend);
  $('[data-trend-tabs]').innerHTML = segmentedHtml(TRENDS, t.value, 'data-trend-id');
  $('[data-trend-desc]').textContent = `${t.desc} ${range.single ? 'per jam' : 'per hari'}, ${range.label}`;
  const opts = { labels: s.series.labels, series: [{ label: t.label, values: s.series[t.key], style: 'current' }], height: 260, format: t.format };
  if (analytics.chart) analytics.chart.update(opts);
  else analytics.chart = createTrendChart($('[data-trend-chart]'), opts);
}

$('[data-trend-tabs]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-trend-id]');
  if (!btn || !analytics.summary) return;
  analytics.trend = btn.dataset.trendId;
  renderTrend();
});

// "12 menit lalu" untuk hari ini, selain itu tanggal dan jam.
function fmtWhen(iso) {
  return new Date(iso).toDateString() === new Date().toDateString() ? fmtRelative(iso) : fmtDateTime(iso);
}

function renderUsers() {
  const q = analytics.search;
  // Pengguna yang bertanya di rentang; pertanyaan dan ulasan dihitung di rentang, login terakhir keseluruhan.
  const users = analytics.summary.userRows.filter((u) => !q || `${u.name} ${u.unit}`.toLowerCase().includes(q));
  $('[data-users-title]').innerHTML = `Pengguna <span class="font-normal text-mid-gray">${users.length}</span>`;
  $('[data-users]').innerHTML =
    users
      .map((u) => {
        const rated = u.up + u.down;
        return `<tr>
          <td><span class="block font-medium">${esc(u.name)}</span><span class="block text-caption tracking-normal text-mid-gray">${esc(u.unit)}</span></td>
          <td class="whitespace-nowrap text-mid-gray">${u.lastLogin ? fmtWhen(u.lastLogin) : '–'}</td>
          <td class="num">${fmtInt(u.questions)}</td>
          <td class="num whitespace-nowrap">${rated ? `${fmtPct(u.up / rated)} sesuai<span class="block text-caption tracking-normal text-mid-gray">${rated} ulasan</span>` : '<span class="text-mid-gray">Belum ada</span>'}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="4" class="py-6 text-center text-mid-gray">Tidak ada pengguna yang cocok.</td></tr>';
}

$('[data-users-search]').addEventListener('input', (e) => {
  analytics.search = e.target.value.trim().toLowerCase();
  if (analytics.summary) renderUsers();
});

const RATING_BADGE = {
  up: '<span class="badge badge-solid">Sesuai</span>',
  down: '<span class="badge badge-alert">Tidak sesuai</span>',
};

// Satu baris per pertanyaan. Jawaban lengkap dibuka dengan klik supaya daftar tetap ringkas.
function renderChats() {
  const { history: list, counts } = analytics.data;
  const filters = CHAT_FILTERS.map((f) => ({ ...f, label: `${f.label} (${fmtInt(counts[f.value])})` }));
  $('[data-chats-filter]').innerHTML = segmentedHtml(filters, analytics.chatFilter, 'data-chats-filter-id');
  const total = counts[analytics.chatFilter];
  $('[data-chats-title]').innerHTML = `Riwayat chat <span class="font-normal text-mid-gray">${total > list.length ? `${list.length} terbaru dari ${fmtInt(total)}` : fmtInt(total)}</span>`;
  const open = new Set([...document.querySelectorAll('[data-chats] details[open]')].map((d) => d.dataset.id));
  $('[data-chats]').innerHTML =
    list
      .map((h) => `<li>
        <details class="group" data-id="${esc(h.id)}" ${open.has(h.id) ? 'open' : ''}>
          <summary class="flex cursor-pointer list-none items-start gap-3 px-5 py-3 transition-colors hover:bg-canvas [&::-webkit-details-marker]:hidden">
            <span class="min-w-0 flex-1">
              <span class="block font-medium">${esc(h.question)}</span>
              <span class="mt-0.5 block text-caption tracking-normal text-mid-gray">${esc(h.userName)} · ${esc(h.unit)} · ${fmtWhen(h.time)}</span>
            </span>
            <span class="flex shrink-0 items-center gap-2">${RATING_BADGE[h.rating] ?? ''}<i data-lucide="chevron-down" class="size-4 text-mid-gray transition-transform group-open:rotate-180" aria-hidden="true"></i></span>
          </summary>
          <div class="px-5 pb-4">
            <p class="rounded-nested bg-canvas px-3.5 py-2.5 whitespace-pre-line">${esc(h.answer)}</p>
            <p class="mt-1.5 text-caption tracking-normal text-mid-gray">${esc(h.model)} · ${fmtInt(h.inputTokens + h.outputTokens)} token${h.rating ? '' : ' · Belum diulas'}</p>
          </div>
        </details>
      </li>`)
      .join('') || '<li class="px-5 py-6 text-center text-mid-gray">Belum ada riwayat chat.</li>';
  renderIcons($('[data-chats]'));
}

$('[data-chats-filter]').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-chats-filter-id]');
  if (!btn || !analytics.data) return;
  analytics.chatFilter = btn.dataset.chatsFilterId;
  await loadAnalytics();
});

showView();

// Pertanyaan yang dikirim lewat ?q= (mis. dari halaman lain).
const q = getParam('q');
if (q) {
  setParams({ q: null });
  chat.ask(q);
}
