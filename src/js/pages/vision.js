import { createDateRange } from '../components/date-range.js';
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
import { parkingRange, summarizeParking, visitMinutes } from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmtDateTime, fmtDuration, fmtInt, fmtPct, fmtTime } from '../utils/format.js';
import { rangeQuery } from '../utils/range.js';

mountLayout({ page: 'vision' });

const state = { parking: null, stats: null, visits: null, zoneId: 'A', view: getViewMode(), visitFilter: 'all', visitSearch: '' };

// Rentang waktu berlaku untuk jumlah masuk/keluar, grafik okupansi, dan riwayat kendaraan.
// Peta slot, rekap zona, kamera, dan deteksi gerbang terbaru selalu kondisi saat ini.
const picker = createDateRange($('[data-range]'), {
  onChange: async () => {
    await loadRanged();
    render();
  },
});
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
  const range = picker.range;
  const r = state.stats ? parkingRange(state.stats, range) : null;
  $('[data-kpis]').innerHTML = [
    statTile({ label: 'Kapasitas', value: p.total, unit: ' slot', sub: `${p.car.total} mobil · ${p.motorcycle.total} motor` }),
    statTile({ label: 'Terisi', value: p.occupied, sub: 'Saat ini' }),
    statTile({ label: 'Kosong', value: p.free, sub: `Saat ini · ${p.car.free} mobil, ${p.motorcycle.free} motor` }),
    statTile({ label: 'Okupansi', value: fmtPct(p.rate), sub: 'Saat ini' }),
    statTile({ label: `Masuk ${range.short}`, value: r ? fmtInt(r.in) : '–', sub: r ? `Rata-rata parkir ${fmtDuration(r.avgDurationMin)}` : '' }),
    statTile({ label: `Keluar ${range.short}`, value: r ? fmtInt(r.out) : '–' }),
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

function renderChart() {
  if (!state.stats) return;
  const range = picker.range;
  const r = parkingRange(state.stats, range);
  const lines = r.series.second
    ? [{ label: 'Puncak', values: r.series.main, style: 'current' }, { label: 'Rata-rata', values: r.series.second, style: 'previous' }]
    : [{ label: 'Okupansi', values: r.series.main, style: 'current' }];
  const now = r.series.labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
  const opts = { labels: r.series.labels, series: lines, height: 260, format: (v) => `${v}% terisi`, selected: range.preset === 'today' && now >= 0 ? now : undefined };
  $('[data-chart-legend]').classList.toggle('hidden', lines.length < 2);
  $('[data-chart-legend]').innerHTML = lines.length > 1 ? lineLegendHtml(lines) : '';
  $('[data-chart-desc]').textContent = `${range.single ? 'Per jam' : 'Puncak dan rata-rata per hari'}, ${range.label}`;
  $('[data-chart-summary]').innerHTML = `<span class="text-ink/80">Puncak</span><span class="font-semibold tabular-nums">${Math.round(r.peak * 100)}%</span>`;
  if (chart) chart.update(opts);
  else chart = createTrendChart($('[data-chart]'), opts);
}

/* --------------------------- riwayat kendaraan --------------------------- */

function renderVisits() {
  if (!state.visits) return;
  const { items, counts } = state.visits;
  const filters = [
    { value: 'all', label: `Semua (${fmtInt(counts.all)})` },
    { value: 'inside', label: `Di dalam (${fmtInt(counts.inside)})` },
    { value: 'out', label: `Sudah keluar (${fmtInt(counts.out)})` },
  ];
  $('[data-visits-filter]').innerHTML = segmentedHtml(filters, state.visitFilter, 'data-visits-filter-id');
  const shown = counts[state.visitFilter];
  $('[data-visits-title]').innerHTML = `Riwayat kendaraan <span class="font-normal text-mid-gray">${shown > items.length ? `${items.length} terbaru dari ${fmtInt(shown)}` : fmtInt(shown)}</span>`;
  const zones = new Map(state.parking.zones.map((z) => [z.id, z]));
  // Rentang lebih dari satu hari: tampilkan tanggal di jam masuk/keluar.
  const when = picker.range.single ? fmtTime : fmtDateTime;
  $('[data-visits]').innerHTML =
    items
      .map((x) => `<tr>
          <td class="font-mono font-medium whitespace-nowrap">${esc(x.plate)}</td>
          <td>${VEHICLE_TYPES[x.vehicleType].label}</td>
          <td class="whitespace-nowrap">${esc(zones.get(x.zoneId)?.name ?? '–')}${x.slotId ? ` <span class="text-mid-gray">· ${esc(x.slotId)}</span>` : ''}</td>
          <td class="whitespace-nowrap">${when(x.inAt)} <span class="text-caption tracking-normal text-mid-gray">${esc(x.gateIn)}</span></td>
          <td class="whitespace-nowrap">${x.outAt ? `${when(x.outAt)} <span class="text-caption tracking-normal text-mid-gray">${esc(x.gateOut)}</span>` : '<span class="badge badge-solid">Masih parkir</span>'}</td>
          <td class="num">${fmtDuration(visitMinutes(x))}</td>
          <td class="num text-mid-gray">${Math.round(x.confidence * 100)}%</td>
        </tr>`)
      .join('') || '<tr><td colspan="7" class="py-6 text-center text-mid-gray">Tidak ada kendaraan yang cocok.</td></tr>';
}

async function loadVisits() {
  const range = picker.range;
  const res = await api.getParkingVisits({ ...rangeQuery(range), status: state.visitFilter, q: state.visitSearch });
  if (picker.range.label === range.label) state.visits = res;
}

$('[data-visits-filter]').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-visits-filter-id]');
  if (!btn) return;
  state.visitFilter = btn.dataset.visitsFilterId;
  await loadVisits();
  renderVisits();
});
let searchTimer = null;
$('[data-visits-search]').addEventListener('input', (e) => {
  state.visitSearch = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    await loadVisits();
    renderVisits();
  }, 250);
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

// Data berentang waktu dimuat ulang saat rentang berganti dan tiap pembaruan realtime.
async function loadRanged() {
  const range = picker.range;
  const [stats] = await Promise.all([api.getParkingStats(rangeQuery(range)), loadVisits()]);
  if (picker.range.label === range.label) state.stats = stats;
}

async function load() {
  try {
    [state.parking] = await Promise.all([api.getParking(), loadRanged()]);
    render();
  } catch (err) {
    $('[data-kpis]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat data parkir: ${err.message}`)}</div>`;
  }
}

api.subscribe(async (next) => {
  if (!next.parking) return;
  state.parking = next.parking;
  await loadRanged();
  render();
});

load();
