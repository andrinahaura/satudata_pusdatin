import { mountLayout } from '../components/layout.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { createTrendChart } from '../components/trend-chart.js';
import { cameraCardHtml } from '../components/camera-feed.js';
import { renderIcons } from '../components/icons.js';
import { createParkingMap, parkingLegendHtml } from '../components/parking-map.js';
import { createParking3D } from '../components/three/parking-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { errorState, segmentedHtml, statTile } from '../components/ui.js';
import { VEHICLE_TYPES } from '../data/device-types.js';
import { api } from '../services/api.js';
import { summarizeParking, summarizeVisits } from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmtDuration, fmtInt, fmtPct, fmtTime } from '../utils/format.js';

mountLayout({ page: 'vision' });

const state = { parking: null, zoneId: 'A', view: getViewMode(), chartPeriod: 'day', visitFilter: 'all', visitSearch: '' };
const maps = {
  '3d': createParking3D($('[data-map-3d]')),
  '2d': createParkingMap($('[data-map-2d]')),
};

$('[data-view-toggle]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view-mode]');
  if (!btn) return;
  state.view = btn.dataset.viewMode;
  setViewMode(state.view);
  render();
});
let chart = null;

$('[data-parking-legend]').innerHTML = parkingLegendHtml();
$('[data-zone-tabs]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-zone]');
  if (!b) return;
  state.zoneId = b.dataset.zone;
  render();
});

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

function renderKpis(p) {
  const { today } = state.parking;
  $('[data-kpis]').innerHTML = [
    statTile({ label: 'Kapasitas', value: p.total, unit: ' slot', sub: `${p.car.total} mobil · ${p.motorcycle.total} motor` }),
    statTile({ label: 'Terisi', value: p.occupied }),
    statTile({ label: 'Kosong', value: p.free, sub: `${p.car.free} mobil · ${p.motorcycle.free} motor` }),
    statTile({ label: 'Okupansi', value: fmtPct(p.rate) }),
    statTile({ label: 'Masuk hari ini', value: fmtInt(sum(today.in)) }),
    statTile({ label: 'Keluar hari ini', value: fmtInt(sum(today.out)) }),
  ].join('');
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.parking.updatedAt)}`;
}

function renderMap(p) {
  const zone = state.parking.zones.find((z) => z.id === state.zoneId) ?? state.parking.zones[0];
  $('[data-zone-tabs]').innerHTML = segmentedHtml(state.parking.zones.map((z) => ({ value: z.id, label: z.name })), zone.id, 'data-zone');
  $('[data-view-toggle]').innerHTML = viewToggleHtml(state.view);
  $('[data-map-3d]').classList.toggle('hidden', state.view !== '3d');
  $('[data-map-2d]').classList.toggle('hidden', state.view !== '2d');
  maps[state.view].update(zone, state.parking.cameras);
}

function renderZones(p) {
  $('[data-zones]').innerHTML = p.zones
    .map((z) => `<tr class="cursor-pointer transition-colors hover:bg-canvas ${z.id === state.zoneId ? 'bg-surface-alt' : ''}" data-zone-row="${z.id}">
        <td><span class="font-medium">${esc(z.name)}</span><span class="block text-caption tracking-normal text-mid-gray">${esc(z.location)}</span></td>
        <td class="num">${z.occupied}</td>
        <td class="num font-medium">${z.free}</td>
        <td class="num">${fmtPct(z.occupied / z.total)}</td>
      </tr>`)
    .join('');
  $('[data-zones-total]').innerHTML = `<tr><td>Total</td><td class="num">${p.occupied}</td><td class="num">${p.free}</td><td class="num">${fmtPct(p.rate)}</td></tr>`;

  const parked = { car: 0, motorcycle: 0, truck: 0 };
  state.parking.zones.forEach((z) => z.slots.forEach((s) => s.occupied && (parked[s.vehicleType] += 1)));
  const total = Math.max(1, sum(parked));
  $('[data-vehicle-types]').innerHTML = Object.entries(VEHICLE_TYPES)
    .map(([k, v]) => `<tr><td>${v.label}</td><td class="num font-medium">${parked[k]}</td><td class="num text-mid-gray">${fmtPct(parked[k] / total)}</td></tr>`)
    .join('');
}

$('[data-zones]').addEventListener('click', (e) => {
  const row = e.target.closest('[data-zone-row]');
  if (!row) return;
  state.zoneId = row.dataset.zoneRow;
  render();
});

function renderCameras() {
  const cams = state.parking.cameras;
  $('[data-camera-count]').textContent = `${cams.filter((c) => c.online).length} dari ${cams.length} aktif`;
  $('[data-cameras]').innerHTML = cams.map(cameraCardHtml).join('');
}

const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function renderChart() {
  $('[data-chart-period]').innerHTML = segmentedHtml([{ value: 'day', label: 'Per jam' }, { value: 'week', label: '7 hari' }], state.chartPeriod, 'data-chart-period-id');
  let opts;
  let peak;
  if (state.chartPeriod === 'week') {
    const week = state.parking.historyWeek;
    const labels = week.map((d) => WEEKDAY_SHORT[new Date(`${d.date}T00:00`).getDay()]);
    const series = [
      { label: 'Puncak', values: week.map((d) => Math.round(d.peak * 100)), style: 'current' },
      { label: 'Rata-rata', values: week.map((d) => Math.round(d.avg * 100)), style: 'previous' },
    ];
    peak = Math.max(...series[0].values);
    opts = { labels, series, height: 260, format: (v) => `${v}%`, selected: labels.length - 1 };
    $('[data-chart-legend]').innerHTML = lineLegendHtml(series);
  } else {
    const { history } = state.parking;
    const labels = history.map((h) => h.hour.slice(0, 2));
    const values = history.map((h) => Math.round(h.occupancy * 100));
    const now = labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
    peak = Math.max(...values);
    opts = { labels, series: [{ label: 'Okupansi', values, style: 'current' }], height: 260, format: (v) => `${v}% terisi`, selected: now >= 0 ? now : undefined };
  }
  $('[data-chart-legend]').classList.toggle('hidden', state.chartPeriod !== 'week');
  $('[data-chart-title]').textContent = state.chartPeriod === 'week' ? 'Okupansi parkir 7 hari' : 'Okupansi parkir per jam';
  $('[data-chart-summary]').innerHTML = `<span class="text-ink/80">Puncak</span><span class="font-semibold tabular-nums">${peak}%</span>`;
  if (chart) chart.update(opts);
  else chart = createTrendChart($('[data-chart]'), opts);
}

$('[data-chart-period]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-chart-period-id]');
  if (!btn) return;
  state.chartPeriod = btn.dataset.chartPeriodId;
  renderChart();
});

/* --------------------------- riwayat kendaraan --------------------------- */

function renderVisits() {
  const v = summarizeVisits(state.parking);
  const filters = [
    { value: 'all', label: `Semua (${v.total})` },
    { value: 'inside', label: `Di dalam (${v.inside})` },
    { value: 'out', label: `Sudah keluar (${v.done})` },
  ];
  $('[data-visits-filter]').innerHTML = segmentedHtml(filters, state.visitFilter, 'data-visits-filter-id');
  const zones = new Map(state.parking.zones.map((z) => [z.id, z]));
  const q = state.visitSearch.replace(/\s+/g, '');
  const list = state.parking.visits
    .filter((x) => state.visitFilter === 'all' || (state.visitFilter === 'inside' ? !x.outAt : x.outAt))
    .filter((x) => !q || x.plate.replace(/\s+/g, '').toLowerCase().includes(q))
    .slice(0, 120);
  $('[data-visits]').innerHTML =
    list
      .map((x) => `<tr>
          <td class="font-mono font-medium whitespace-nowrap">${esc(x.plate)}</td>
          <td>${VEHICLE_TYPES[x.vehicleType].label}</td>
          <td class="whitespace-nowrap">${esc(zones.get(x.zoneId)?.name ?? '–')}${x.slotId ? ` <span class="text-mid-gray">· ${esc(x.slotId)}</span>` : ''}</td>
          <td class="whitespace-nowrap">${fmtTime(x.inAt)} <span class="text-caption tracking-normal text-mid-gray">${esc(x.gateIn)}</span></td>
          <td class="whitespace-nowrap">${x.outAt ? `${fmtTime(x.outAt)} <span class="text-caption tracking-normal text-mid-gray">${esc(x.gateOut)}</span>` : '<span class="badge badge-solid">Masih parkir</span>'}</td>
          <td class="num">${fmtDuration(v.minutes(x))}</td>
          <td class="num text-mid-gray">${Math.round(x.confidence * 100)}%</td>
        </tr>`)
      .join('') || '<tr><td colspan="7" class="py-6 text-center text-mid-gray">Tidak ada kendaraan yang cocok.</td></tr>';
}

$('[data-visits-filter]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-visits-filter-id]');
  if (!btn) return;
  state.visitFilter = btn.dataset.visitsFilterId;
  renderVisits();
});
$('[data-visits-search]').addEventListener('input', (e) => {
  state.visitSearch = e.target.value.trim().toLowerCase();
  renderVisits();
});

// Jumlah baris riwayat yang muat utuh di kartu (tinggi kartu mengikuti grafik di sebelahnya).
const EVENT_ROW_H = 44;
const HEAD_H = 34;
function eventRowsThatFit() {
  // Layar sempit: kartu ditumpuk dan tidak punya tinggi tetap, tampilkan 6 baris.
  if (!window.matchMedia('(min-width: 1024px)').matches) return 6;
  const h = $('[data-events-box]').clientHeight - 8; // pb-2
  return Math.max(3, Math.floor((h - HEAD_H) / EVENT_ROW_H));
}

function renderEvents() {
  $('[data-events]').innerHTML = state.parking.events
    .slice(0, eventRowsThatFit())
    .map((ev) => `<tr>
        <td class="text-mid-gray">${fmtTime(ev.time)}</td>
        <td class="whitespace-nowrap"><span class="font-mono text-[13px] font-medium">${esc(ev.plate)}</span> <span class="text-caption tracking-normal text-mid-gray">${VEHICLE_TYPES[ev.vehicleType].label}</span></td>
        <td class="whitespace-nowrap"><span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span> <span class="text-caption tracking-normal text-mid-gray">${esc(ev.gate)}</span></td>
        <td class="num">${Math.round(ev.confidence * 100)}%</td>
      </tr>`)
    .join('');
}

let lastBoxHeight = 0;
new ResizeObserver(() => {
  const h = $('[data-events-box]').clientHeight;
  if (state.parking && Math.abs(h - lastBoxHeight) > 2) {
    lastBoxHeight = h;
    renderEvents();
  }
}).observe($('[data-events-box]'));

function render() {
  if (!state.parking) return;
  const p = summarizeParking(state.parking);
  renderKpis(p);
  renderMap(p);
  renderZones(p);
  renderCameras();
  renderChart();
  renderEvents();
  renderVisits();
  renderIcons($('main'));
}

async function load() {
  try {
    state.parking = await api.getParking();
    render();
  } catch (err) {
    $('[data-kpis]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat data parkir: ${err.message}`)}</div>`;
  }
}

api.subscribe((next) => {
  if (!next.parking) return;
  state.parking = next.parking;
  render();
});

load();
