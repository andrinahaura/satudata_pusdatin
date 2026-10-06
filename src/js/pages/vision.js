import { mountLayout } from '../components/layout.js';
import { createBarChart } from '../components/bar-chart.js';
import { cameraCardHtml } from '../components/camera-feed.js';
import { renderIcons } from '../components/icons.js';
import { createParkingMap, parkingLegendHtml } from '../components/parking-map.js';
import { createParking3D } from '../components/three/parking-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { errorState, meter, segmentedHtml, statTile } from '../components/ui.js';
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
    statTile({ label: 'Terisi', value: p.occupied, sub: 'Kendaraan terdeteksi' }),
    statTile({ label: 'Kosong', value: p.free, sub: `${p.car.free} mobil · ${p.motorcycle.free} motor` }),
    statTile({ label: 'Okupansi', value: fmtPct(p.rate), sub: 'Seluruh area' }),
    statTile({ label: 'Masuk hari ini', value: fmtInt(sum(today.in)), sub: 'Deteksi gerbang' }),
    statTile({ label: 'Keluar hari ini', value: fmtInt(sum(today.out)), sub: 'Deteksi gerbang' }),
  ].join('');
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.parking.updatedAt)}`;
}

function renderMap(p) {
  const zone = state.parking.zones.find((z) => z.id === state.zoneId) ?? state.parking.zones[0];
  const zs = p.zones.find((z) => z.id === zone.id);
  $('[data-zone-tabs]').innerHTML = segmentedHtml(state.parking.zones.map((z) => ({ value: z.id, label: z.name })), zone.id, 'data-zone');
  $('[data-zone-desc]').textContent = `${zone.location} · ${zs.free} kosong dari ${zs.total} slot ${VEHICLE_TYPES[zone.kind].label.toLowerCase()}`;
  $('[data-view-toggle]').innerHTML = viewToggleHtml(state.view);
  $('[data-map-3d]').classList.toggle('hidden', state.view !== '3d');
  $('[data-map-2d]').classList.toggle('hidden', state.view !== '2d');
  maps[state.view].update(zone, state.parking.cameras);
}

function renderZones(p) {
  $('[data-zones]').innerHTML = p.zones
    .map((z) => `
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="min-w-0 truncate font-medium">${esc(z.name)}</span>
          <span class="text-mid-gray tabular-nums"><span class="font-semibold text-ink">${z.free}</span> kosong / ${z.total}</span>
        </div>
        ${meter(z.occupied / z.total, `Okupansi ${z.name}`)}
        <p class="mt-1 text-caption tracking-normal text-mid-gray">${esc(z.location)} · ${fmtPct(z.occupied / z.total)} terisi</p>
      </div>`)
    .join('');

  const parked = { car: 0, motorcycle: 0, truck: 0 };
  state.parking.zones.forEach((z) => z.slots.forEach((s) => s.occupied && (parked[s.vehicleType] += 1)));
  const total = Math.max(1, sum(parked));
  $('[data-vehicle-types]').innerHTML = Object.entries(VEHICLE_TYPES)
    .map(([k, v]) => `
      <div class="flex items-center gap-3">
        <span class="w-16 shrink-0">${v.label}</span>
        <div class="flex-1">${meter(parked[k] / total, v.label)}</div>
        <span class="w-8 text-right font-semibold tabular-nums">${parked[k]}</span>
      </div>`)
    .join('');
}

function renderCameras() {
  const cams = state.parking.cameras;
  $('[data-camera-count]').textContent = `${cams.filter((c) => c.online).length} dari ${cams.length} aktif`;
  $('[data-cameras]').innerHTML = cams.map(cameraCardHtml).join('');
}

function renderChart() {
  const data = state.parking.history.map((h) => ({ label: h.hour.slice(0, 2), value: Math.round(h.occupancy * 100) }));
  const opts = { data, max: 100, height: 240, format: (v) => `${v}% terisi`, tickFormat: (v) => `${v}%`, highlight: String(new Date().getHours()).padStart(2, '0') };
  if (chart) chart.update(opts);
  else chart = createBarChart($('[data-chart]'), opts);
}

function renderEvents() {
  $('[data-events]').innerHTML = state.parking.events
    .slice(0, 20)
    .map((ev) => `
      <tr>
        <td class="px-5 py-2.5 text-mid-gray tabular-nums">${fmtTime(ev.time)}</td>
        <td class="px-3 py-2.5"><span class="font-mono tabular-nums text-[13px] font-medium whitespace-nowrap">${esc(ev.plate)}</span> <span class="text-caption tracking-normal text-mid-gray">${VEHICLE_TYPES[ev.vehicleType].label}</span></td>
        <td class="px-3 py-2.5"><span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span> <span class="text-caption tracking-normal text-mid-gray">${esc(ev.gate)}</span></td>
        <td class="px-5 py-2.5 text-right tabular-nums">${Math.round(ev.confidence * 100)}%</td>
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
