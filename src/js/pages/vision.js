import { mountLayout } from '../components/layout.js';
import { createTrendChart } from '../components/trend-chart.js';
import { cameraCardHtml } from '../components/camera-feed.js';
import { renderIcons } from '../components/icons.js';
import { createParkingMap, parkingLegendHtml } from '../components/parking-map.js';
import { createParking3D } from '../components/three/parking-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { errorState, segmentedHtml, statTile } from '../components/ui.js';
import { VEHICLE_TYPES } from '../data/device-types.js';
import { api } from '../services/api.js';
import { summarizeParking } from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmtInt, fmtPct, fmtTime } from '../utils/format.js';

mountLayout({ page: 'vision' });

const state = { parking: null, zoneId: 'A', view: getViewMode() };
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

function renderChart() {
  const { history } = state.parking;
  const labels = history.map((h) => h.hour.slice(0, 2));
  const values = history.map((h) => Math.round(h.occupancy * 100));
  const now = labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
  const peak = Math.max(...values);
  $('[data-chart-summary]').innerHTML = `<span class="text-ink/80">Puncak</span><span class="font-semibold tabular-nums">${peak}%</span>`;
  const opts = { labels, series: [{ label: 'Okupansi', values, style: 'current' }], height: 260, format: (v) => `${v}% terisi`, selected: now >= 0 ? now : undefined };
  if (chart) chart.update(opts);
  else chart = createTrendChart($('[data-chart]'), opts);
}

function renderEvents() {
  $('[data-events]').innerHTML = state.parking.events
    .slice(0, 20)
    .map((ev) => `<tr>
        <td class="text-mid-gray">${fmtTime(ev.time)}</td>
        <td class="whitespace-nowrap"><span class="font-mono text-[13px] font-medium">${esc(ev.plate)}</span> <span class="text-caption tracking-normal text-mid-gray">${VEHICLE_TYPES[ev.vehicleType].label}</span></td>
        <td class="whitespace-nowrap"><span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span> <span class="text-caption tracking-normal text-mid-gray">${esc(ev.gate)}</span></td>
        <td class="num">${Math.round(ev.confidence * 100)}%</td>
      </tr>`)
    .join('');
}

function render() {
  if (!state.parking) return;
  const p = summarizeParking(state.parking);
  renderKpis(p);
  renderMap(p);
  renderZones(p);
  renderCameras();
  renderChart();
  renderEvents();
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
