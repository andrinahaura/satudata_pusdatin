// Home: ringkasan KPI dan grafik dari tiga menu, IoT, AI Vision, dan Chatbot.
// Denah dan detail lain ada di halaman masing-masing; setiap bagian punya tautan ke sana.
// Rentang waktu (pemilih di kanan atas) berlaku untuk KPI riwayat dan semua grafik.
// KPI bertanda "Saat ini" (perangkat online, peringatan aktif, suhu, slot kosong) selalu realtime.
import { createDateRange } from '../components/date-range.js';
import { mountLayout } from '../components/layout.js';
import { renderIcons } from '../components/icons.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { modelUsageHtml } from '../components/model-usage.js';
import { createTrendChart } from '../components/trend-chart.js';
import { siteLabel, siteSlotsHtml } from '../components/parking-site.js';
import { errorState, sectionHeadHtml, statTile } from '../components/ui.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import {
  deviceUptime, energyRange, getAlerts, parkingRange, summarizeChat, summarizeIot, summarizeParking, summarizeVisits,
} from '../services/selectors.js';
import { $, $$ } from '../utils/dom.js';
import { fmt1, fmtCompact, fmtDuration, fmtInt, fmtPct, fmtRupiah, fmtTime } from '../utils/format.js';
import { rangeQuery } from '../utils/range.js';

mountLayout({ page: 'home' });

const state = { iot: null, parking: null, history: null, notifications: null, chat: null, energy: null, parkingStats: null };
const charts = {};

const picker = createDateRange($('[data-range]'), {
  onChange: async () => {
    await loadRanged();
    render();
  },
});

$('[data-head-iot]').innerHTML = sectionHeadHtml({ title: 'IoT', id: 'home-iot', desc: 'Perangkat, peringatan, konektivitas, dan listrik', href: '/iot.html', linkLabel: 'Buka IoT' });
$('[data-head-vision]').innerHTML = sectionHeadHtml({ title: 'AI Vision', id: 'home-vision', desc: 'Nomor polisi, kendaraan masuk dan keluar, slot parkir', href: '/vision.html', linkLabel: 'Buka AI Vision' });
$('[data-head-chatbot]').innerHTML = sectionHeadHtml({ title: 'Chatbot', id: 'home-chatbot', desc: 'Pengguna, pertanyaan, token, dan mutu jawaban', href: '/chatbot.html#analitik', linkLabel: 'Buka analitik' });

const pct2 = (ratio) => `${(ratio * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

function chart(key, selector, opts) {
  if (charts[key]) charts[key].update(opts);
  else charts[key] = createTrendChart($(selector), opts);
}

/* ---------------------------------- IoT ---------------------------------- */

function renderIot(range) {
  const s = summarizeIot(state.iot);
  const alerts = getAlerts(state.iot, state.parking);
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const u = state.history ? deviceUptime(state.history, state.iot, range) : null;
  const e = state.energy ? energyRange(state.iot, state.energy, range) : null;
  const sent = state.notifications?.items.filter((i) => i.status === 'sent').length ?? 0;

  $('[data-kpis-iot]').innerHTML = [
    statTile({ label: 'Perangkat online', value: s.online, unit: ` / ${s.totalDevices}`, sub: `Saat ini · ${s.offline ? `${s.offline} offline` : 'semua terhubung'}` }),
    statTile({ label: `Uptime ${range.short}`, value: u ? pct2(u.overall) : '–', sub: u ? `${u.outages} gangguan koneksi` : '', href: '/iot.html#riwayat' }),
    statTile({ label: 'Peringatan aktif', value: alerts.length, sub: `Saat ini · ${alerts.length ? `${critical} kritis, ${alerts.length - critical} perhatian` : 'semua normal'}`, href: '/iot.html#peringatan', alert: critical > 0 }),
    statTile({ label: 'Notifikasi Telegram', value: fmtInt(sent), unit: ' pesan', sub: `Terkirim ${range.short}`, href: '/iot.html#peringatan' }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Saat ini · kelembaban ${Math.round(s.avgHumidity)}%` }),
    statTile({ label: `Listrik ${range.short}`, value: e ? fmt1(e.kwh) : '–', unit: ' kWh', sub: e ? fmtRupiah(e.rupiah) : '', href: '/iot.html#listrik' }),
  ].join('');

  if (e) {
    const series = e.seriesFor();
    const lines = [
      series.target && { label: 'Target', values: series.target, style: 'target' },
      { label: range.previousLabel, values: series.previous, style: 'previous' },
      { label: range.currentLabel, values: series.current, style: 'current' },
    ].filter(Boolean);
    chart('energy', '[data-energy-chart]', { labels: series.labels, series: lines, height: 240, format: (v) => `${fmt1(v)} kWh` });
    $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());
  }

  if (u) {
    chart('uptime', '[data-uptime-chart]', {
      labels: u.buckets.map((b) => b.label),
      series: [{ label: 'Uptime', values: u.buckets.map((b) => (b.ratio == null ? null : b.ratio * 100)), style: 'current' }],
      height: 240,
      format: (v) => `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% terhubung`,
    });
    $('[data-uptime-note]').textContent = `Porsi waktu perangkat terhubung ${range.single ? 'per jam' : 'per hari'}. Saat ini ${u.disconnected} perangkat terputus.`;
  }
}

/* -------------------------------- AI Vision -------------------------------- */

function renderVision(range) {
  const p = summarizeParking(state.parking);
  const v = summarizeVisits(state.parking);
  const r = state.parkingStats ? parkingRange(state.parkingStats, range) : null;

  $('[data-kpis-vision]').innerHTML = [
    statTile({ label: 'Slot kosong', value: p.free, unit: ` / ${p.total}`, sub: `Saat ini · ${p.car.free} mobil, ${p.motorcycle.free} motor` }),
    statTile({ label: 'Okupansi', value: fmtPct(p.rate), sub: 'Saat ini' }),
    statTile({ label: 'Kendaraan di dalam', value: v.inside, sub: 'Saat ini' }),
    statTile({ label: `Masuk ${range.short}`, value: r ? fmtInt(r.in) : '–', sub: 'Tercatat di gerbang' }),
    statTile({ label: `Keluar ${range.short}`, value: r ? fmtInt(r.out) : '–', sub: 'Tercatat di gerbang' }),
    statTile({ label: 'Rata-rata lama parkir', value: r ? fmtDuration(r.avgDurationMin) : '–', sub: `Kendaraan keluar ${range.short}` }),
  ].join('');

  if (r) {
    const now = r.series.labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
    const lines = r.series.second
      ? [{ label: 'Puncak', values: r.series.main, style: 'current' }, { label: 'Rata-rata', values: r.series.second, style: 'previous' }]
      : [{ label: 'Okupansi', values: r.series.main, style: 'current' }];
    $('[data-parking-peak]').innerHTML = `<span class="text-ink/80">Puncak</span><span class="font-semibold tabular-nums">${Math.round(r.peak * 100)}%</span>`;
    chart('parking', '[data-parking-chart]', {
      labels: r.series.labels,
      series: lines,
      height: 240,
      format: (x) => `${x}% terisi`,
      selected: range.preset === 'today' && now >= 0 ? now : undefined,
    });
    $('[data-parking-legend]').classList.toggle('hidden', lines.length < 2);
    $('[data-parking-legend]').innerHTML = lines.length > 1 ? lineLegendHtml(lines) : '';
  }

  $('[data-site-name]').textContent = siteLabel(state.parking.site);
  $('[data-site-slots]').innerHTML = siteSlotsHtml(p);
}

/* --------------------------------- Chatbot --------------------------------- */

function renderChatbot(range) {
  if (!state.chat) return;
  const c = summarizeChat(state.chat, range);

  $('[data-kpis-chatbot]').innerHTML = [
    statTile({ label: 'Pengguna chatbot', value: fmtInt(c.users), unit: ' orang', sub: `Bertanya ${range.short}` }),
    statTile({ label: 'Pertanyaan', value: fmtInt(c.questions), sub: range.short }),
    statTile({ label: 'Token', value: fmtCompact(c.tokens), sub: range.short }),
    statTile({ label: 'Estimasi biaya', value: fmtRupiah(c.rupiah), sub: range.short }),
    statTile({ label: 'Jawaban sesuai', value: c.rated ? fmtPct(c.upRate) : '–', sub: `Dari ${fmtInt(c.rated)} ulasan` }),
  ].join('');

  const series = [
    { label: 'Pertanyaan', values: c.series.questions, style: 'current' },
    c.series.activeUsers && { label: 'Pengguna aktif', values: c.series.activeUsers, style: 'previous' },
  ].filter(Boolean);
  chart('questions', '[data-question-chart]', { labels: c.series.labels, series, height: 240, format: (v) => fmtInt(v) });
  $('[data-question-legend]').innerHTML = lineLegendHtml(series);

  $('[data-model-usage]').innerHTML = modelUsageHtml(c);
}

/* --------------------------------- data --------------------------------- */

function render() {
  if (!state.iot || !state.parking) return;
  const range = picker.range;
  $$('[data-range-short]').forEach((el) => (el.textContent = range.short));
  $('[data-period-label]').textContent = range.label;
  renderIot(range);
  renderVision(range);
  renderChatbot(range);
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.iot.updatedAt)}`;
  renderIcons($('main'));
}

// Data berentang waktu dimuat ulang saat rentang berganti dan tiap pembaruan realtime.
async function loadRanged() {
  const range = picker.range;
  const q = rangeQuery(range);
  const [history, notifications, chat, energy, parkingStats] = await Promise.allSettled([
    api.getIotHistory(q),
    api.getNotifications(q),
    api.getChatAnalytics(q),
    api.getEnergyHistory(rangeQuery(range, { withPrevious: true })),
    api.getParkingStats(q),
  ]);
  // Rentang sudah diganti lagi selama memuat: hasil ini sudah basi.
  if (picker.range.label !== range.label) return;
  const value = (r) => (r.status === 'fulfilled' ? r.value : null);
  Object.assign(state, { history: value(history), notifications: value(notifications), chat: value(chat), energy: value(energy), parkingStats: value(parkingStats) });
}

async function load() {
  try {
    [state.iot, state.parking] = await Promise.all([api.getIot(), api.getParking(), loadRanged()]);
    render();
  } catch (err) {
    $('[data-kpis-iot]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat data: ${err.message}`)}</div>`;
  }
}

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
