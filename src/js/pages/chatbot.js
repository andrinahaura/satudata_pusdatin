import { createChat } from '../components/chat.js';
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
const analytics = { data: null, trend: 'questions', search: '', chatFilter: 'all', chart: null, timer: null };

// Satu grafik, tiga pilihan data. Satu seri per pilihan supaya tidak ada dua skala di satu sumbu.
const TRENDS = [
  { value: 'questions', label: 'Pertanyaan', desc: 'Jumlah pertanyaan per hari', key: 'questions', format: (v) => `${fmtInt(v)} pertanyaan` },
  { value: 'tokens', label: 'Token', desc: 'Token masuk dan keluar per hari', key: 'tokens', format: (v) => `${fmtCompact(v)} token` },
  { value: 'cost', label: 'Biaya', desc: 'Estimasi biaya model AI per hari', key: 'rupiah', format: (v) => fmtRupiah(v) },
];

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
  try {
    analytics.data = await api.getChatAnalytics();
    renderAnalytics();
  } catch (err) {
    $('[data-chat-kpis]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat analitik: ${err.message}`)}</div>`;
  }
}

function renderAnalytics() {
  const s = summarizeChat(analytics.data);
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(analytics.data.updatedAt)}`;
  $('[data-chat-kpis]').innerHTML = [
    statTile({ label: 'Pengguna', value: fmtInt(s.users), unit: ' orang', sub: `${s.activeToday} aktif hari ini` }),
    statTile({ label: 'Pertanyaan', value: fmtInt(s.questions), sub: `30 hari · ${fmtInt(s.questionsToday)} hari ini` }),
    statTile({ label: 'Biaya AI', value: fmtRupiah(s.rupiah), sub: `30 hari · ${fmtCompact(s.tokens)} token` }),
    statTile({ label: 'Jawaban sesuai', value: fmtPct(s.upRate), sub: `Dari ${fmtInt(s.rated)} ulasan` }),
  ].join('');
  renderTrend(s);
  $('[data-model-usage]').innerHTML = modelUsageHtml(s);
  renderUsers();
  renderChats();
}

const TREND_DAYS = 7;
const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function renderTrend(s = summarizeChat(analytics.data)) {
  const t = TRENDS.find((x) => x.value === analytics.trend);
  $('[data-trend-tabs]').innerHTML = segmentedHtml(TRENDS, t.value, 'data-trend-id');
  $('[data-trend-desc]').textContent = t.desc;
  const labels = analytics.data.daily.slice(-TREND_DAYS).map((d) => WEEKDAY_SHORT[new Date(`${d.date}T00:00`).getDay()]);
  const values = s.series[t.key].slice(-TREND_DAYS);
  const opts = { labels, series: [{ label: t.label, values, style: 'current' }], height: 260, format: t.format };
  if (analytics.chart) analytics.chart.update(opts);
  else analytics.chart = createTrendChart($('[data-trend-chart]'), opts);
}

$('[data-trend-tabs]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-trend-id]');
  if (!btn || !analytics.data) return;
  analytics.trend = btn.dataset.trendId;
  renderTrend();
});

// "12 menit lalu" untuk hari ini, selain itu tanggal dan jam.
function fmtWhen(iso) {
  return new Date(iso).toDateString() === new Date().toDateString() ? fmtRelative(iso) : fmtDateTime(iso);
}

function renderUsers() {
  const q = analytics.search;
  const users = analytics.data.users
    .filter((u) => u.questions > 0)
    .filter((u) => !q || `${u.name} ${u.unit}`.toLowerCase().includes(q))
    .sort((a, b) => b.lastLogin.localeCompare(a.lastLogin));
  $('[data-users-title]').innerHTML = `Pengguna <span class="font-normal text-mid-gray">${users.length}</span>`;
  $('[data-users]').innerHTML =
    users
      .map((u) => {
        const rated = u.ratings.up + u.ratings.down;
        return `<tr>
          <td><span class="block font-medium">${esc(u.name)}</span><span class="block text-caption tracking-normal text-mid-gray">${esc(u.unit)}</span></td>
          <td class="whitespace-nowrap text-mid-gray">${fmtWhen(u.lastLogin)}</td>
          <td class="num">${fmtInt(u.questions)}</td>
          <td class="num whitespace-nowrap">${rated ? `${fmtPct(u.ratings.up / rated)} sesuai<span class="block text-caption tracking-normal text-mid-gray">${rated} ulasan</span>` : '<span class="text-mid-gray">Belum ada</span>'}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="4" class="py-6 text-center text-mid-gray">Tidak ada pengguna yang cocok.</td></tr>';
}

$('[data-users-search]').addEventListener('input', (e) => {
  analytics.search = e.target.value.trim().toLowerCase();
  if (analytics.data) renderUsers();
});

const RATING_BADGE = {
  up: '<span class="badge badge-solid">Sesuai</span>',
  down: '<span class="badge badge-alert">Tidak sesuai</span>',
};

// Satu baris per pertanyaan. Jawaban lengkap dibuka dengan klik supaya daftar tetap ringkas.
function renderChats() {
  const all = analytics.data.history;
  const list = all.filter((h) => analytics.chatFilter === 'all' || h.rating === analytics.chatFilter);
  const filters = CHAT_FILTERS.map((f) => ({ ...f, label: f.value === 'all' ? f.label : `${f.label} (${all.filter((h) => h.rating === f.value).length})` }));
  $('[data-chats-filter]').innerHTML = segmentedHtml(filters, analytics.chatFilter, 'data-chats-filter-id');
  $('[data-chats-title]').innerHTML = `Riwayat chat <span class="font-normal text-mid-gray">${list.length}</span>`;
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

$('[data-chats-filter]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-chats-filter-id]');
  if (!btn || !analytics.data) return;
  analytics.chatFilter = btn.dataset.chatsFilterId;
  renderChats();
});

showView();

// Pertanyaan yang dikirim lewat ?q= (mis. dari halaman lain).
const q = getParam('q');
if (q) {
  setParams({ q: null });
  chat.ask(q);
}
