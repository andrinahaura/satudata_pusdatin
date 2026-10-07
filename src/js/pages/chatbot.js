import { createChat } from '../components/chat.js';
import { renderIcons } from '../components/icons.js';
import { mountLayout } from '../components/layout.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { createTrendChart } from '../components/trend-chart.js';
import { errorState, segmentedHtml, statTile } from '../components/ui.js';
import { DOCUMENTS } from '../data/documents.js';
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
const analytics = { data: null, search: '', tokenChart: null, questionChart: null, timer: null };

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
  const chat = analytics.data;
  const s = summarizeChat(chat);
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(chat.updatedAt)}`;

  $('[data-chat-kpis]').innerHTML = [
    statTile({ label: 'Pengguna chatbot', value: fmtInt(s.users), unit: ' orang', sub: `${s.activeToday} aktif hari ini` }),
    statTile({ label: 'Pertanyaan 30 hari', value: fmtInt(s.questions), sub: `${fmtInt(s.questionsToday)} hari ini` }),
    statTile({ label: 'Token 30 hari', value: fmtCompact(s.tokens), sub: `${fmtCompact(s.tokensToday)} hari ini` }),
    statTile({ label: 'Estimasi biaya', value: fmtRupiah(s.rupiah), sub: `${fmtRupiah(s.rupiahToday)} hari ini` }),
    statTile({ label: 'Rata-rata token', value: fmtInt(s.questions ? Math.round(s.tokens / s.questions) : 0), unit: ' / pertanyaan' }),
    statTile({ label: 'Jawaban sesuai', value: fmtPct(s.upRate), sub: `dari ${fmtInt(s.rated)} penilaian` }),
  ].join('');

  const tokenSeries = [
    { label: 'Token masuk', values: s.series.inputTokens, style: 'current' },
    { label: 'Token keluar', values: s.series.outputTokens, style: 'previous' },
  ];
  const tokenOpts = { labels: s.series.labels, series: tokenSeries, height: 240, format: (v) => `${fmtCompact(v)} token` };
  if (analytics.tokenChart) analytics.tokenChart.update(tokenOpts);
  else analytics.tokenChart = createTrendChart($('[data-token-chart]'), tokenOpts);
  $('[data-token-legend]').innerHTML = lineLegendHtml(tokenSeries);

  const questionSeries = [
    { label: 'Pertanyaan', values: s.series.questions, style: 'current' },
    { label: 'Pengguna aktif', values: s.series.activeUsers, style: 'previous' },
  ];
  const questionOpts = { labels: s.series.labels, series: questionSeries, height: 240, format: (v) => fmtInt(v) };
  if (analytics.questionChart) analytics.questionChart.update(questionOpts);
  else analytics.questionChart = createTrendChart($('[data-question-chart]'), questionOpts);
  $('[data-question-legend]').innerHTML = lineLegendHtml(questionSeries);

  $('[data-model-rows]').innerHTML = s.byModel
    .map((m) => `<tr><td class="font-medium">${esc(m.model)}</td><td class="num">${fmtInt(m.questions)}</td><td class="num">${fmtCompact(m.tokens)}</td><td class="num">${fmtRupiah(m.rupiah)}</td></tr>`)
    .join('');
  $('[data-model-total]').innerHTML = `<tr><td>Total</td><td class="num">${fmtInt(s.questions)}</td><td class="num">${fmtCompact(s.tokens)}</td><td class="num">${fmtRupiah(s.rupiah)}</td></tr>`;

  // Satu batang bertumpuk: sesuai (navy) dan tidak sesuai (merah), dipisah celah 2px.
  const up = s.rated ? (s.ratings.up / s.rated) * 100 : 0;
  $('[data-rating-count]').textContent = `${fmtInt(s.rated)} penilaian`;
  $('[data-rating-summary]').innerHTML = `
    <p class="text-heading-sm font-semibold tabular-nums">${fmtPct(s.upRate)} <span class="text-body font-normal text-mid-gray">jawaban dinilai sesuai</span></p>
    <div class="mt-4 flex h-3 gap-0.5" role="img" aria-label="Sesuai ${fmtInt(s.ratings.up)}, tidak sesuai ${fmtInt(s.ratings.down)}">
      <div class="rounded-l-full bg-ink ${s.ratings.down ? '' : 'rounded-r-full'}" style="width:${up.toFixed(1)}%" title="Sesuai: ${fmtInt(s.ratings.up)}"></div>
      ${s.ratings.down ? `<div class="flex-1 rounded-r-full bg-ember" title="Tidak sesuai: ${fmtInt(s.ratings.down)}"></div>` : ''}
    </div>
    <dl class="mt-4 grid grid-cols-2 gap-4">
      <div><dt class="flex items-center gap-1.5 text-mid-gray"><span class="dot bg-ink"></span>Sesuai</dt><dd class="text-subheading font-semibold tabular-nums">${fmtInt(s.ratings.up)}</dd></div>
      <div><dt class="flex items-center gap-1.5 text-mid-gray"><span class="dot bg-ember"></span>Tidak sesuai</dt><dd class="text-subheading font-semibold tabular-nums">${fmtInt(s.ratings.down)}</dd></div>
    </dl>
    <p class="mt-4 text-mid-gray">Penilaian diberikan pengguna lewat tombol di bawah setiap jawaban.</p>`;

  const integrations = [
    { name: 'SITABA', desc: 'Informasi kebencanaan', status: '<span class="badge badge-solid">Terhubung</span>' },
    { name: 'Basis dokumen (RAG)', desc: `${DOCUMENTS.length} dokumen, jawaban dengan rujukan`, status: '<span class="badge badge-solid">Aktif</span>' },
    { name: 'Unggah & analisis dokumen', desc: 'PDF, Word, dan teks', status: '<span class="badge badge-solid">Aktif</span>' },
    { name: 'Single Sign-On (SSO)', desc: 'Login dengan akun PU', status: '<span class="badge badge-outline">Dalam kajian</span>' },
  ];
  $('[data-integrations]').innerHTML = integrations
    .map((i) => `<li class="flex items-center justify-between gap-3 px-5 py-3"><span class="min-w-0"><span class="block font-medium">${i.name}</span><span class="block text-mid-gray">${i.desc}</span></span>${i.status}</li>`)
    .join('');

  renderUsers();

  $('[data-feedback]').innerHTML =
    chat.feedback
      .slice(0, 20)
      .map((f) => `<li class="px-5 py-3">
          <div class="flex items-start justify-between gap-3">
            <p class="min-w-0 font-medium">${esc(f.question || '(tanpa pertanyaan)')}</p>
            ${f.rating === 'up' ? '<span class="badge badge-solid shrink-0">Sesuai</span>' : '<span class="badge badge-alert shrink-0">Tidak sesuai</span>'}
          </div>
          ${f.note || f.answer ? `<p class="mt-1 text-mid-gray">${esc(f.note ?? f.answer)}</p>` : ''}
          <p class="mt-1 text-caption tracking-normal text-mid-gray">${esc(f.userName)} · ${esc(f.model)} · ${fmtDateTime(f.time)}</p>
        </li>`)
      .join('') || '<li class="px-5 py-6 text-center text-mid-gray">Belum ada ulasan.</li>';
  renderIcons($('[data-view="analytics"]'));
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
      .map((u) => `<tr>
          <td class="font-medium whitespace-nowrap">${esc(u.name)}</td>
          <td class="text-mid-gray">${esc(u.unit)}</td>
          <td class="whitespace-nowrap" title="${esc(fmtDateTime(u.lastLogin))}">${fmtRelativeDay(u.lastLogin)}</td>
          <td class="num">${fmtInt(u.questions)}</td>
          <td class="num whitespace-nowrap"><span title="Sesuai">${u.ratings.up}</span> <span class="text-mid-gray">/</span> <span class="${u.ratings.down ? 'text-ember' : 'text-mid-gray'}" title="Tidak sesuai">${u.ratings.down}</span></td>
        </tr>`)
      .join('') || '<tr><td colspan="5" class="py-6 text-center text-mid-gray">Tidak ada pengguna yang cocok.</td></tr>';
}

// "12 menit lalu" untuk hari ini, selain itu tanggal dan jam.
function fmtRelativeDay(iso) {
  return new Date(iso).toDateString() === new Date().toDateString() ? fmtRelative(iso) : fmtDateTime(iso);
}

$('[data-users-search]').addEventListener('input', (e) => {
  analytics.search = e.target.value.trim().toLowerCase();
  if (analytics.data) renderUsers();
});

showView();

// Pertanyaan yang dikirim lewat ?q= (mis. dari halaman lain).
const q = getParam('q');
if (q) {
  setParams({ q: null });
  chat.ask(q);
}
