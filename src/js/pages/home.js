import { mountLayout } from '../components/layout.js';
import { createFloorPlan, floorPlanLegend } from '../components/floor-plan.js';
import { renderIcons } from '../components/icons.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { createTrendChart } from '../components/trend-chart.js';
import { createAlertPanel } from '../components/alert-panel.js';
import { errorState, floorTargetCell, segmentedHtml, statTile } from '../components/ui.js';
import { VEHICLE_TYPES } from '../data/device-types.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import { energyByFloor, energySeries, getAlerts, summarizeIot, summarizeParking } from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmt1, fmtDate, fmtInt, fmtPct, fmtTime } from '../utils/format.js';

mountLayout({ page: 'home' });

const state = { iot: null, parking: null, floorId: 'L1' };

$('[data-today]').textContent = fmtDate();
$('[data-floor-legend]').innerHTML = floorPlanLegend();

const plan = createFloorPlan($('[data-floor-plan]'), {
  onRoomSelect: (roomId) => {
    location.href = `/iot.html?floor=${state.floorId}&room=${roomId}`;
  },
});

$('[data-floor-tabs]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-floor]');
  if (!btn) return;
  state.floorId = btn.dataset.floor;
  renderFloor();
});

const rupiah = (v) => `Rp ${fmtInt(Math.round(v))}`;
const pct = (ratio) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${Math.abs(Math.round(ratio * 100))}%`;

function renderKpis() {
  const s = summarizeIot(state.iot);
  const p = summarizeParking(state.parking);
  const e = energyByFloor(state.iot, 'harian');
  $('[data-kpis]').innerHTML = [
    statTile({ label: 'Perangkat online', value: s.online, unit: ` / ${s.totalDevices}`, sub: s.offline ? `${s.offline} offline` : '' }),
    statTile({ label: 'Lampu menyala', value: s.byType.light.on, unit: ` / ${s.byType.light.total}` }),
    statTile({ label: 'AC menyala', value: s.byType.ac.on, unit: ` / ${s.byType.ac.total}` }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%` }),
    statTile({ label: 'Listrik hari ini', value: fmt1(e.kwh), unit: ' kWh', sub: rupiah(e.rupiah) }),
    statTile({ label: 'Parkir kosong', value: p.free, unit: ` / ${p.total}`, sub: `Okupansi ${fmtPct(p.rate)}` }),
  ].join('');
}

function renderFloor() {
  const floors = state.iot.building.floors;
  const floor = floors.find((f) => f.id === state.floorId) ?? floors[0];
  $('[data-floor-tabs]').innerHTML = segmentedHtml(floors.map((f) => ({ value: f.id, label: f.short })), floor.id, 'data-floor');
  plan.update({ floor, devices: state.iot.devices });
}

let energyChart = null;

function renderEnergy() {
  const e = energyByFloor(state.iot, 'harian');
  const series = energySeries(state.iot, 'harian');
  const trafo = state.iot.energy.panels.find((x) => x.source);
  const lines = [
    { label: 'Target', values: series.target, style: 'target' },
    { label: 'Kemarin', values: series.previous, style: 'previous' },
    { label: 'Hari ini', values: series.current, style: 'current' },
  ];
  const opts = { labels: series.labels, series: lines, height: 240, format: (v) => `${fmt1(v)} kWh` };
  if (energyChart) energyChart.update(opts);
  else energyChart = createTrendChart($('[data-energy-chart]'), opts);
  $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());

  $('[data-flow-load]').textContent = `Beban ${fmt1(trafo.kw)} kW`;
  $('[data-energy-floors]').innerHTML = e.floors
    .map((f) => `<tr>
        <td>${floorTargetCell(f, { href: `/iot.html?floor=${f.floor.id}#listrik`, fmt: fmt1 })}</td>
        <td class="num">${fmt1(f.kwh)}</td>
        <td class="num">${rupiah(f.rupiah)}</td>
        <td class="num text-mid-gray">${pct(f.change)}</td>
      </tr>`)
    .join('');
  $('[data-energy-total]').innerHTML = `<tr><td>Total</td><td class="num">${fmt1(e.kwh)}</td><td class="num">${rupiah(e.rupiah)}</td><td class="num">${pct(e.change)}</td></tr>`;
}

function renderParking() {
  const p = summarizeParking(state.parking);
  $('[data-parking]').innerHTML = p.zones
    .map((z) => `<tr>
        <td><span class="font-medium">${esc(z.name)}</span> <span class="text-mid-gray">${esc(z.location)}</span></td>
        <td class="num">${z.occupied}</td>
        <td class="num font-medium">${z.free}</td>
        <td class="num">${fmtPct(z.occupied / z.total)}</td>
      </tr>`)
    .join('');
  $('[data-parking-total]').innerHTML = `<tr><td>Total</td><td class="num">${p.occupied}</td><td class="num">${p.free}</td><td class="num">${fmtPct(p.rate)}</td></tr>`;
}

function renderEvents() {
  $('[data-events]').innerHTML = state.parking.events
    .slice(0, 6)
    .map((ev) => `<tr>
        <td class="text-mid-gray">${fmtTime(ev.time)}</td>
        <td class="font-mono font-medium whitespace-nowrap">${esc(ev.plate)}</td>
        <td>${VEHICLE_TYPES[ev.vehicleType].label}</td>
        <td><span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span></td>
        <td class="text-mid-gray whitespace-nowrap">${esc(ev.gate)}</td>
      </tr>`)
    .join('');
}

const alertPanel = createAlertPanel($('[data-alert-panel]'));

// Hal yang dipantau oleh getAlerts(), ditampilkan saat semuanya normal.
function monitoredChecks() {
  const s = summarizeIot(state.iot);
  const p = summarizeParking(state.parking);
  const temps = state.iot.building.floors.flatMap((f) => f.rooms).map((r) => r.temperature).filter((t) => t != null);
  return [
    { label: 'Perangkat online', value: `${s.online}/${s.totalDevices}` },
    { label: 'Suhu ruang tertinggi', value: `${fmt1(Math.max(...temps))}°C` },
    { label: 'Listrik per lantai', value: 'Sesuai target' },
    { label: 'Ruang kosong menyala', value: 'Tidak ada' },
    { label: 'Parkir kosong', value: `${p.free} slot` },
  ];
}

function renderAlerts() {
  const alerts = getAlerts(state.iot, state.parking);
  alertPanel.update(alerts, { checks: monitoredChecks(), checkedAt: fmtTime(state.iot.updatedAt) });
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.iot.updatedAt)}`;
}

function render() {
  if (!state.iot || !state.parking) return;
  renderKpis();
  renderFloor();
  renderEnergy();
  renderParking();
  renderEvents();
  renderAlerts();
  renderIcons($('main'));
}

async function load() {
  try {
    [state.iot, state.parking] = await Promise.all([api.getIot(), api.getParking()]);
    render();
  } catch (err) {
    $('[data-kpis]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat data: ${err.message}`)}</div>`;
  }
}

api.subscribe((next) => {
  if (next.iot) state.iot = next.iot;
  if (next.parking) state.parking = next.parking;
  render();
});
window.addEventListener(DEVICES_CHANGED, async () => {
  state.iot = await api.getIot();
  render();
});

load();
