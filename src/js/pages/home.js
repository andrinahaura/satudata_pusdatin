// Home: ukuran normal seperti halaman lain. Strip status di atas, IoT dan AI Vision bertumpuk di kiri,
// Chatbot di kanan (lihat .cmd-* di main.css). Setiap tile bisa diklik ke halaman detailnya.
// Tombol "Layar penuh" untuk layar ruang monitoring: satu layar tanpa gulir, diskalakan dari kanvas 1366×768.
// Grafik memakai createTrendChart yang sama dengan halaman lain.
// Rentang waktu berlaku untuk angka riwayat dan grafik, kecuali dua tile token Chatbot yang selalu seminggu
// terakhir. Perangkat online, lampu, ruangan terisi,
// ruang parkir tersedia, dan peringatan selalu realtime.
import { createDateRange } from '../components/date-range.js';
import { icon, renderIcons } from '../components/icons.js';
import { mountLayout } from '../components/layout.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { modelUsageHtml } from '../components/model-usage.js';
import { createTrendChart } from '../components/trend-chart.js';
import { slotStatus } from '../components/parking-site.js';
import { errorState } from '../components/ui.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import {
  deviceUptime, energyRange, getAlerts, parkingRange, summarizeChat, summarizeIot, summarizeParking,
} from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmt1, fmtDuration, fmtInt, fmtPct, fmtRupiah, fmtTime } from '../utils/format.js';
import { rangeQuery, resolveRange } from '../utils/range.js';

mountLayout({ page: 'home' });

/* ------------------------------ Layar penuh ------------------------------ */

// Kanvas rancangan: layar monitoring yang lebih besar memperbesar semuanya, jadi teks terbaca dari jauh.
const CANVAS = { width: 1366, height: 768 };
const fullscreenButton = $('[data-fullscreen]');

function applyScreenMode() {
  const full = Boolean(document.fullscreenElement);
  $('[data-screen]').classList.toggle('wall', full);
  document.documentElement.style.setProperty('--fit', full ? Math.min(innerWidth / CANVAS.width, innerHeight / CANVAS.height) : 1);
  fullscreenButton.innerHTML = `${icon(full ? 'minimize' : 'maximize', 'size-4 text-mid-gray')}${full ? 'Keluar layar penuh' : 'Layar penuh'}`;
  renderIcons(fullscreenButton);
}
applyScreenMode();
fullscreenButton.classList.toggle('lg:inline-flex', document.fullscreenEnabled);
fullscreenButton.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()));
document.addEventListener('fullscreenchange', applyScreenMode);
window.addEventListener('resize', applyScreenMode);

// Tile grafik: klik di mana saja membuka detail (tautan di dalamnya tetap untuk keyboard).
$('main').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-href]');
  if (tile && !e.target.closest('a, button')) location.href = tile.dataset.href;
});

const state = { iot: null, parking: null, history: null, chat: null, chatWeek: null, energy: null, parkingStats: null };
const charts = {};

// Jendela tetap untuk tile token Chatbot: tujuh hari sampai hari ini.
const weekRange = () => resolveRange({ preset: '7d' });

const picker = createDateRange($('[data-range]'), {
  onChange: async () => {
    await loadRanged();
    render();
  },
});

// Tinggi minimum grafik tren; dalam mode fill grafik mengisi sisa tinggi tile.
const CHART_MIN_H = 100;

// Dibulatkan ke bawah supaya 99,96% tidak tampil "100%".
const pctFloor = (ratio) => `${(Math.floor(ratio * 1000) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

function chart(key, selector, opts) {
  if (charts[key]) charts[key].update(opts);
  else charts[key] = createTrendChart($(selector), { fill: true, height: CHART_MIN_H, ...opts });
}

// "1 jam 48 menit" dipecah supaya muat di tile: "1 jam" sebagai angka besar, sisanya satuan kecil.
function durationParts(minutes) {
  const [, value, unit] = fmtDuration(minutes).match(/^(\d+ \S+)(.*)$/);
  return { value, unit };
}

/**
 * Satu tile angka: label, nilai (+ satuan), keterangan opsional. Label menyebut benda yang dihitung
 * ("Kendaraan masuk", bukan "Masuk"). `meter` = rasio 0–1 untuk garis tipis di bawah nilai,
 * `aside` = keterangan kecil di kanan nilai.
 */
function stat({ label, value, unit = '', sub = '', aside = '', alert = false, href, meter = null }) {
  return `<a href="${esc(href)}" class="cmd-stat">
      <span class="cmd-stat-label">${esc(label)}</span>
      <span class="flex flex-wrap items-baseline justify-between gap-x-2"><span class="cmd-stat-value ${alert ? 'text-ember' : ''}">${esc(value)}<span class="cmd-unit">${esc(unit)}</span></span>${aside ? `<span class="text-caption tracking-normal ${alert ? 'text-ember' : 'text-mid-gray'}">${esc(aside)}</span>` : ''}</span>
      ${meter != null ? `<span class="cmd-meter"><span style="width:${(Math.max(0, Math.min(1, meter)) * 100).toFixed(1)}%"></span></span>` : ''}
      ${sub ? `<span class="cmd-stat-sub">${esc(sub)}</span>` : ''}
    </a>`;
}

/* -------------------------------- Peringatan -------------------------------- */

const SEVERITY = { critical: { label: 'Kritis', dot: 'bg-ember' }, warning: { label: 'Perhatian', dot: 'bg-accent' } };

// Card peringatan selalu satu baris. Yang tidak muat diwakili satu kotak "+N" di ujung kanan.
const ALERT_CARD_MIN = 250;
const ALERT_GAP = 8;
const ALERT_SQUARE = 56;

function alertItem(a) {
  const sev = SEVERITY[a.severity];
  return `<li class="contents"><a href="${esc(a.href)}" class="cmd-stat">
      <span class="flex items-center gap-2 text-[13px] font-medium"><span class="dot ${sev.dot}" title="${sev.label}"></span><span class="sr-only">${sev.label}:</span><span class="truncate">${esc(a.title)}</span></span>
      <span class="flex items-baseline justify-between gap-2">
        <span class="cmd-stat-sub">${esc(a.place ?? a.meta)}</span>
        <span class="cmd-more">Detail${icon('chevron-right', 'size-3.5')}</span>
      </span>
    </a></li>`;
}

function moreItem(count) {
  return `<li class="contents"><a href="/iot.html#peringatan" class="cmd-stat cmd-alert-square" title="${count} peringatan lainnya" aria-label="${count} peringatan lainnya">
      <span class="cmd-stat-value">+${count}</span>
      <span class="text-[11px] leading-none tracking-normal text-mid-gray">lainnya</span>
    </a></li>`;
}

// Berapa card muat satu baris, dengan atau tanpa kotak "+N".
function alertFit(reserve = 0) {
  const width = $('[data-alert-list]').clientWidth + ALERT_GAP - reserve;
  return Math.max(1, Math.floor(width / (ALERT_CARD_MIN + ALERT_GAP)));
}

function renderAlerts() {
  // Home hanya melaporkan kendala perangkat. Kondisi operasional (ruang kosong, listrik, parkir) ada di halaman IoT.
  const alerts = getAlerts(state.iot).filter((a) => a.type === 'offline');
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warning = alerts.length - critical;
  const split = [critical && `${critical} kritis`, warning && `${warning} perhatian`].filter(Boolean).join(', ');
  const overflow = alerts.length > alertFit();
  const shown = overflow ? alerts.slice(0, alertFit(ALERT_SQUARE + ALERT_GAP)) : alerts;

  $('[data-alert-total]').innerHTML = `<span class="cmd-stat-value ${critical ? 'text-ember' : ''}">${alerts.length}</span>
    <span class="cmd-stat-sub">${split || 'Semua normal'}</span>`;
  $('[data-alert-list]').innerHTML = alerts.length
    ? `${shown.map(alertItem).join('')}${overflow ? moreItem(alerts.length - shown.length) : ''}`
    : '<li class="flex items-center text-mid-gray">Tidak ada peringatan saat ini.</li>';
  renderIcons($('[data-alert-list]'));
}

/* ---------------------------------- IoT ---------------------------------- */

function renderIot(range) {
  const s = summarizeIot(state.iot);
  const u = state.history ? deviceUptime(state.history, state.iot, range) : null;
  const e = state.energy ? energyRange(state.iot, state.energy, range) : null;
  const ratio = u ? Math.max(0, Math.min(1, u.overall)) : null;
  const { light } = s.byType;

  $('[data-iot-stats]').innerHTML = [
    stat({ label: 'Perangkat online', value: s.online, unit: ` / ${s.totalDevices}`, meter: s.online / Math.max(1, s.totalDevices), href: '/iot.html' }),
    stat({ label: 'Kestabilan perangkat', value: ratio == null ? '–' : pctFloor(ratio), alert: ratio != null && ratio < 0.95, href: '/iot.html#riwayat' }),
    stat({ label: 'Lampu menyala', value: light?.on ?? 0, unit: ` / ${light?.total ?? 0} lampu`, href: '/iot.html' }),
    stat({ label: 'Jumlah ruangan terisi', value: s.occupiedRooms, unit: ` / ${s.workspaceRooms} ruang`, href: '/iot.html' }),
  ].join('');

  if (e) {
    const series = e.seriesFor();
    const lines = [
      series.target && { label: 'Target', values: series.target, style: 'target' },
      // "Periode sebelumnya" disingkat supaya judul, angka, dan legenda muat satu baris.
      { label: range.previousLabel.replace('Periode sebelumnya', 'Sebelumnya'), values: series.previous, style: 'previous' },
      { label: range.currentLabel, values: series.current, style: 'current' },
    ].filter(Boolean);
    $('[data-energy-total]').title = `${fmt1(e.kwh)} kWh · ${fmtRupiah(e.rupiah)}`;
    $('[data-energy-total]').innerHTML = `<span class="cmd-stat-value">${fmt1(e.kwh)}<span class="cmd-unit"> kWh · ${esc(fmtRupiah(e.rupiah))}</span></span>`;
    $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());
    chart('energy', '[data-energy-chart]', { labels: series.labels, series: lines, format: (v) => `${fmt1(v)} kWh` });
  }
}

/* -------------------------------- AI Vision -------------------------------- */

const VISITS = '/vision.html#riwayat';

function renderVision(range) {
  const p = summarizeParking(state.parking);
  const r = state.parkingStats ? parkingRange(state.parkingStats, range) : null;
  const st = slotStatus(p);

  $('[data-parking-stats]').innerHTML = [
    stat({ label: 'Ruang Parkir Tersedia', value: p.free, unit: ` / ${p.total}`, alert: st.alert, meter: p.total ? p.free / p.total : 0, aside: st.alert ? st.label : `${fmtPct(p.rate)} terisi`, href: '/vision.html' }),
    stat({ label: 'Rata-rata lama parkir', ...(r ? durationParts(r.avgDurationMin) : { value: '–' }), href: VISITS }),
    stat({ label: 'Kendaraan masuk', value: r ? fmtInt(r.in) : '–', href: VISITS }),
    stat({ label: 'Kendaraan keluar', value: r ? fmtInt(r.out) : '–', href: VISITS }),
  ].join('');

  if (r) {
    const now = r.series.labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
    const lines = r.series.second
      ? [{ label: 'Puncak', values: r.series.main, style: 'current' }, { label: 'Rata-rata', values: r.series.second, style: 'previous' }]
      : [{ label: 'Okupansi', values: r.series.main, style: 'current' }];
    $('[data-parking-legend]').classList.toggle('hidden', lines.length < 2);
    $('[data-parking-legend]').innerHTML = lines.length > 1 ? lineLegendHtml(lines) : '';
    chart('parking', '[data-parking-chart]', {
      labels: r.series.labels,
      series: lines,
      format: (x) => `${x}% terisi`,
      selected: range.preset === 'today' && now >= 0 ? now : undefined,
    });
  }
}

/* --------------------------------- Chatbot --------------------------------- */

const ANALYTICS = '/chatbot.html#analitik';

// "4 sampai 11 November 2026", atau "29 Oktober sampai 4 November 2026" bila beda bulan.
function spanText(first, last) {
  const part = (date, opts) => date.toLocaleDateString('id-ID', opts);
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  const sameYear = first.getFullYear() === last.getFullYear();
  const start = part(first, sameMonth ? { day: 'numeric' } : sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  return `${start} sampai ${part(last, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function renderChatbot(range) {
  if (state.chat) {
    const c = summarizeChat(state.chat, range);
    $('[data-chat-stats]').innerHTML = [
      stat({ label: 'Jawaban sesuai', value: c.rated ? fmtPct(c.upRate) : '–', sub: `dari ${fmtInt(c.rated)} ulasan`, href: ANALYTICS }),
      stat({ label: 'Pengguna', value: fmtInt(c.users), href: ANALYTICS }),
      stat({ label: 'Total pertanyaan', value: fmtInt(c.questions), href: ANALYTICS }),
    ].join('');
  }

  if (state.chatWeek) {
    const week = weekRange();
    const w = summarizeChat(state.chatWeek, week);
    const text = spanText(week.from, week.to);
    $('[data-token-week]').textContent = text;
    $('[data-model-week]').textContent = text;
    // Satu seri saja (judul tile sudah menamainya), jadi tanpa legenda.
    const series = [{ label: 'Token per hari', values: w.series.tokens, style: 'current' }];
    chart('tokens', '[data-token-chart]', { labels: w.series.labels, series, format: (v) => `${fmtInt(v)} token per hari` });
    $('[data-model-usage]').innerHTML = modelUsageHtml(w, { compact: true });
    renderIcons($('[data-model-usage]'));
  }
}

/* --------------------------------- data --------------------------------- */

function render() {
  if (!state.iot || !state.parking) return;
  const range = picker.range;
  renderAlerts();
  renderIot(range);
  renderVision(range);
  renderChatbot(range);
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.iot.updatedAt)}`;
}

// Data berentang waktu dimuat ulang saat rentang berganti dan tiap pembaruan realtime.
async function loadRanged() {
  const range = picker.range;
  const q = rangeQuery(range);
  const [history, chat, chatWeek, energy, parkingStats] = await Promise.allSettled([
    api.getIotHistory(q),
    api.getChatAnalytics(q),
    api.getChatAnalytics(rangeQuery(weekRange())),
    api.getEnergyHistory(rangeQuery(range, { withPrevious: true })),
    api.getParkingStats(q),
  ]);
  // Rentang sudah diganti lagi selama memuat: hasil ini sudah basi.
  if (picker.range.label !== range.label) return;
  const value = (r) => (r.status === 'fulfilled' ? r.value : null);
  Object.assign(state, { history: value(history), chat: value(chat), chatWeek: value(chatWeek), energy: value(energy), parkingStats: value(parkingStats) });
}

async function load() {
  try {
    [state.iot, state.parking] = await Promise.all([api.getIot(), api.getParking(), loadRanged()]);
    render();
  } catch (err) {
    $('[data-alert-list]').innerHTML = `<li class="sm:col-span-full">${errorState(`Gagal memuat data: ${err.message}`)}</li>`;
  }
}

// Lebar baris peringatan berubah (ukuran jendela, layar penuh): hitung ulang card yang muat.
new ResizeObserver(() => {
  if (state.iot) renderAlerts();
}).observe($('[data-alert-list]'));

api.subscribe(async (next) => {
  if (next.iot) state.iot = next.iot;
  if (next.parking) state.parking = next.parking;
  await loadRanged();
  render();
});
window.addEventListener(DEVICES_CHANGED, async () => {
  state.iot = await api.getIot();
  render();
});

load();
