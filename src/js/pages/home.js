// Home: ringkasan KPI dan grafik dari tiga menu, IoT, AI Vision, dan Chatbot.
// Denah dan detail lain ada di halaman masing-masing; setiap bagian punya tautan ke sana.
import { mountLayout } from '../components/layout.js';
import { renderIcons } from '../components/icons.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { createTrendChart } from '../components/trend-chart.js';
import { barListHtml, errorState, sectionHeadHtml, statTile } from '../components/ui.js';
import { VEHICLE_TYPES } from '../data/device-types.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import {
  deviceUptime, energyByFloor, energySeries, getAlerts, summarizeChat, summarizeIot, summarizeParking, summarizeVisits,
} from '../services/selectors.js';
import { $ } from '../utils/dom.js';
import { fmt1, fmtCompact, fmtDate, fmtDuration, fmtInt, fmtPct, fmtRupiah, fmtTime } from '../utils/format.js';

mountLayout({ page: 'home' });

const state = { iot: null, parking: null, history: null, notifications: null, chat: null };
const charts = {};

$('[data-today]').textContent = fmtDate();
$('[data-head-iot]').innerHTML = sectionHeadHtml({ title: 'IoT', id: 'home-iot', desc: 'Perangkat, peringatan, konektivitas, dan listrik', href: '/iot.html', linkLabel: 'Buka IoT' });
$('[data-head-vision]').innerHTML = sectionHeadHtml({ title: 'AI Vision', id: 'home-vision', desc: 'Nomor polisi, kendaraan masuk dan keluar, slot parkir', href: '/vision.html', linkLabel: 'Buka AI Vision' });
$('[data-head-chatbot]').innerHTML = sectionHeadHtml({ title: 'Chatbot', id: 'home-chatbot', desc: 'Pengguna, pertanyaan, token, dan mutu jawaban', href: '/chatbot.html#analitik', linkLabel: 'Buka analitik' });

const pct2 = (ratio) => `${(ratio * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

function chart(key, selector, opts) {
  if (charts[key]) charts[key].update(opts);
  else charts[key] = createTrendChart($(selector), opts);
}

/* ---------------------------------- IoT ---------------------------------- */

function renderIot() {
  const s = summarizeIot(state.iot);
  const e = energyByFloor(state.iot, 'harian');
  const alerts = getAlerts(state.iot, state.parking);
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const u = state.history ? deviceUptime(state.history, state.iot) : null;
  const today = new Date().toDateString();
  const sentToday = state.notifications?.items.filter((i) => i.status === 'sent' && new Date(i.time).toDateString() === today).length ?? 0;

  $('[data-kpis-iot]').innerHTML = [
    statTile({ label: 'Perangkat online', value: s.online, unit: ` / ${s.totalDevices}`, sub: s.offline ? `${s.offline} offline` : 'Semua terhubung' }),
    statTile({ label: 'Uptime 7 hari', value: u ? pct2(u.overall) : '–', sub: u ? `${u.outages} gangguan koneksi` : '', href: '/iot.html#riwayat' }),
    statTile({ label: 'Peringatan aktif', value: alerts.length, sub: alerts.length ? `${critical} kritis · ${alerts.length - critical} perhatian` : 'Semua normal', href: '/iot.html#peringatan', alert: critical > 0 }),
    statTile({ label: 'Notifikasi Telegram', value: sentToday, unit: ' pesan', sub: 'Terkirim hari ini', href: '/iot.html#peringatan' }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%` }),
    statTile({ label: 'Listrik hari ini', value: fmt1(e.kwh), unit: ' kWh', sub: fmtRupiah(e.rupiah), href: '/iot.html#listrik' }),
  ].join('');

  const series = energySeries(state.iot, 'harian');
  const lines = [
    { label: 'Target', values: series.target, style: 'target' },
    { label: 'Kemarin', values: series.previous, style: 'previous' },
    { label: 'Hari ini', values: series.current, style: 'current' },
  ];
  chart('energy', '[data-energy-chart]', { labels: series.labels, series: lines, height: 240, format: (v) => `${fmt1(v)} kWh` });
  $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());

  if (u) {
    chart('uptime', '[data-uptime-chart]', {
      labels: u.daily.map((d) => d.label),
      series: [{ label: 'Uptime', values: u.daily.map((d) => d.ratio * 100), style: 'current' }],
      height: 240,
      format: (v) => `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% terhubung`,
    });
    $('[data-uptime-note]').textContent = `Porsi waktu perangkat terhubung. Saat ini ${u.disconnected} perangkat terputus.`;
  }
}

/* -------------------------------- AI Vision -------------------------------- */

function renderVision() {
  const p = summarizeParking(state.parking);
  const v = summarizeVisits(state.parking);
  const { today, history } = state.parking;

  $('[data-kpis-vision]').innerHTML = [
    statTile({ label: 'Slot kosong', value: p.free, unit: ` / ${p.total}`, sub: `${p.car.free} mobil · ${p.motorcycle.free} motor` }),
    statTile({ label: 'Okupansi', value: fmtPct(p.rate) }),
    statTile({ label: 'Kendaraan di dalam', value: v.inside, sub: 'Plat tercatat di gerbang' }),
    statTile({ label: 'Masuk hari ini', value: fmtInt(sum(today.in)) }),
    statTile({ label: 'Keluar hari ini', value: fmtInt(sum(today.out)) }),
    statTile({ label: 'Rata-rata lama parkir', value: fmtDuration(v.avgDoneMinutes), sub: 'Kendaraan yang sudah keluar' }),
  ].join('');

  const labels = history.map((h) => h.hour.slice(0, 2));
  const values = history.map((h) => Math.round(h.occupancy * 100));
  const now = labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
  $('[data-parking-peak]').innerHTML = `<span class="text-ink/80">Puncak</span><span class="font-semibold tabular-nums">${Math.max(...values)}%</span>`;
  chart('parking', '[data-parking-chart]', { labels, series: [{ label: 'Okupansi', values, style: 'current' }], height: 240, format: (x) => `${x}% terisi`, selected: now >= 0 ? now : undefined });

  $('[data-zone-bars]').innerHTML = barListHtml(
    p.zones.map((z) => ({ label: z.name, sub: z.location, value: z.occupied / z.total, display: `${fmtPct(z.occupied / z.total)} · ${z.free} kosong` })),
    { max: 1 },
  );
  const parked = { car: 0, motorcycle: 0, truck: 0 };
  state.parking.zones.forEach((z) => z.slots.forEach((slot) => slot.occupied && (parked[slot.vehicleType] += 1)));
  $('[data-type-bars]').innerHTML = barListHtml(
    Object.entries(VEHICLE_TYPES).map(([k, t]) => ({ label: t.label, value: parked[k], display: `${parked[k]} · ${fmtPct(parked[k] / Math.max(1, p.occupied))}` })),
    { max: p.occupied },
  );
}

/* --------------------------------- Chatbot --------------------------------- */

function renderChatbot() {
  if (!state.chat) return;
  const c = summarizeChat(state.chat);

  $('[data-kpis-chatbot]').innerHTML = [
    statTile({ label: 'Pengguna chatbot', value: fmtInt(c.users), unit: ' orang', sub: 'Pernah bertanya ke chatbot' }),
    statTile({ label: 'Aktif hari ini', value: fmtInt(c.activeToday), unit: ' orang' }),
    statTile({ label: 'Pertanyaan 30 hari', value: fmtInt(c.questions), sub: `${fmtInt(c.questionsToday)} hari ini` }),
    statTile({ label: 'Token 30 hari', value: fmtCompact(c.tokens), sub: `${fmtCompact(c.tokensToday)} hari ini` }),
    statTile({ label: 'Estimasi biaya', value: fmtRupiah(c.rupiah), sub: '30 hari terakhir' }),
    statTile({ label: 'Jawaban sesuai', value: fmtPct(c.upRate), sub: `dari ${fmtInt(c.rated)} penilaian` }),
  ].join('');

  const series = [
    { label: 'Pertanyaan', values: c.series.questions, style: 'current' },
    { label: 'Pengguna aktif', values: c.series.activeUsers, style: 'previous' },
  ];
  chart('questions', '[data-question-chart]', { labels: c.series.labels, series, height: 240, format: (v) => fmtInt(v) });
  $('[data-question-legend]').innerHTML = lineLegendHtml(series);

  $('[data-model-bars]').innerHTML = barListHtml(
    c.byModel.map((m) => ({ label: m.model, sub: `${fmtInt(m.questions)} pertanyaan`, value: m.tokens, display: `${fmtCompact(m.tokens)} token · ${fmtRupiah(m.rupiah)}` })),
  );
  // Satu batang bertumpuk: sesuai (navy) dan tidak sesuai (merah), label teks di bawahnya.
  const up = c.rated ? (c.ratings.up / c.rated) * 100 : 0;
  $('[data-rating-summary]').innerHTML = `
    <div class="flex items-baseline justify-between gap-3">
      <h4 class="font-semibold">Penilaian jawaban</h4>
      <span class="text-mid-gray tabular-nums">${fmtInt(c.rated)} penilaian</span>
    </div>
    <div class="mt-3 flex h-2 gap-0.5" role="img" aria-label="Sesuai ${fmtInt(c.ratings.up)}, tidak sesuai ${fmtInt(c.ratings.down)}">
      <div class="rounded-l-full bg-ink ${c.ratings.down ? '' : 'rounded-r-full'}" style="width:${up.toFixed(1)}%"></div>
      ${c.ratings.down ? '<div class="flex-1 rounded-r-full bg-ember"></div>' : ''}
    </div>
    <div class="mt-2 flex justify-between gap-3 text-mid-gray">
      <span class="inline-flex items-center gap-1.5"><span class="dot bg-ink"></span>Sesuai ${fmtInt(c.ratings.up)}</span>
      <span class="inline-flex items-center gap-1.5"><span class="dot bg-ember"></span>Tidak sesuai ${fmtInt(c.ratings.down)}</span>
    </div>`;
}

/* --------------------------------- data --------------------------------- */

function render() {
  if (!state.iot || !state.parking) return;
  renderIot();
  renderVision();
  renderChatbot();
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.iot.updatedAt)}`;
  renderIcons($('main'));
}

// Riwayat, notifikasi, dan analitik chatbot tidak ikut realtime: dimuat ulang tiap pembaruan.
async function loadExtras() {
  const [history, notifications, chat] = await Promise.allSettled([api.getIotHistory(), api.getNotifications(), api.getChatAnalytics()]);
  if (history.status === 'fulfilled') state.history = history.value;
  if (notifications.status === 'fulfilled') state.notifications = notifications.value;
  if (chat.status === 'fulfilled') state.chat = chat.value;
}

async function load() {
  try {
    [state.iot, state.parking] = await Promise.all([api.getIot(), api.getParking(), loadExtras()]);
    render();
  } catch (err) {
    $('[data-kpis-iot]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat data: ${err.message}`)}</div>`;
  }
}

api.subscribe(async (next) => {
  if (next.iot) state.iot = next.iot;
  if (next.parking) state.parking = next.parking;
  await loadExtras();
  render();
});
window.addEventListener(DEVICES_CHANGED, async () => {
  state.iot = await api.getIot();
  render();
});

load();
