import { mountLayout } from '../components/layout.js';
import { createChat } from '../components/chat.js';
import { createFloorPlan, floorPlanLegend } from '../components/floor-plan.js';
import { renderIcons } from '../components/icons.js';
import { createLineChart, lineLegendHtml } from '../components/line-chart.js';
import { alertListHtml, errorState, meter, segmentedHtml, statTile } from '../components/ui.js';
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

createChat(document.getElementById('home-chat'), { placeholder: 'Contoh: lampu yang belum mati?' });

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
    statTile({ label: 'Perangkat online', value: `${s.online}/${s.totalDevices}`, sub: s.offline ? `${s.offline} perangkat offline` : 'Semua terhubung' }),
    statTile({ label: 'Lampu menyala', value: s.byType.light.on, sub: `dari ${s.byType.light.total} lampu` }),
    statTile({ label: 'AC menyala', value: s.byType.ac.on, sub: `dari ${s.byType.ac.total} unit` }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%` }),
    statTile({ label: 'Listrik hari ini', value: fmt1(e.kwh), unit: ' kWh', sub: rupiah(e.rupiah) }),
    statTile({ label: 'Parkir kosong', value: p.free, unit: ` / ${p.total}`, sub: `Okupansi ${fmtPct(p.rate)}` }),
  ].join('');
}

function renderFloor() {
  const floors = state.iot.building.floors;
  const floor = floors.find((f) => f.id === state.floorId) ?? floors[0];
  $('[data-floor-tabs]').innerHTML = segmentedHtml(floors.map((f) => ({ value: f.id, label: f.short })), floor.id, 'data-floor');
  const s = summarizeIot(state.iot, floor.id);
  $('[data-floor-desc]').textContent = `${floor.name} · ${floor.label} — ${s.byType.light.on} lampu menyala, ${s.people} orang`;
  plan.update({ floor, devices: state.iot.devices });
}

let energyChart = null;

function renderEnergy() {
  const e = energyByFloor(state.iot, 'harian');
  const series = energySeries(state.iot, 'harian');
  const trafo = state.iot.energy.panels.find((x) => x.source);
  $('[data-energy-desc]').textContent = `Seluruh gedung · kWh per jam · diperbarui ${fmtTime(e.updatedAt)}`;
  $('[data-energy-total]').innerHTML = `
    <div>
      <p class="text-heading font-semibold tracking-[-0.025em] tabular-nums">${fmt1(e.kwh)}<span class="ml-1 text-body font-medium text-mid-gray">kWh</span></p>
      <p class="text-mid-gray tabular-nums">${rupiah(e.rupiah)}</p>
    </div>
    <p class="pb-1 text-mid-gray tabular-nums">${pct(e.change)} vs kemarin di jam yang sama · beban ${fmt1(trafo.kw)} kW</p>`;
  const lines = [
    { label: 'Target', values: series.target, style: 'target' },
    { label: 'Kemarin', values: series.previous, style: 'previous' },
    { label: 'Hari ini', values: series.current, style: 'current' },
  ];
  const opts = { labels: series.labels, series: lines, height: 200, format: (v) => `${fmt1(v)} kWh`, tickFormat: (v) => fmt1(v) };
  if (energyChart) energyChart.update(opts);
  else energyChart = createLineChart($('[data-energy-chart]'), opts);
  $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());

  $('[data-flow-load]').textContent = `${fmt1(trafo.kw)} kW saat ini`;
  $('[data-energy-floors]').innerHTML = e.floors
    .map((f) => `
      <a href="/iot.html?floor=${f.floor.id}#listrik" class="-mx-2 block rounded-nested px-2 py-1 transition-colors hover:bg-canvas">
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="flex items-center gap-2 font-medium">${esc(f.floor.name)}${f.anomaly ? '<span class="badge badge-alert">Di atas target</span>' : ''}</span>
          <span class="tabular-nums"><span class="font-medium">${fmt1(f.kwh)}</span> <span class="text-mid-gray">kWh</span></span>
        </div>
        ${meter(f.share, `Porsi ${f.floor.name}`)}
        <p class="mt-1.5 flex justify-between gap-2 text-caption tracking-normal text-mid-gray tabular-nums"><span>${rupiah(f.rupiah)}</span><span>${pct(f.change)} vs kemarin</span></p>
      </a>`)
    .join('');
}

function renderParking() {
  const p = summarizeParking(state.parking);
  const zones = p.zones
    .map((z) => `
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="font-medium">${esc(z.name)}</span>
          <span class="text-mid-gray tabular-nums"><span class="font-medium text-ink">${z.free}</span> kosong / ${z.total}</span>
        </div>
        ${meter(z.occupied / z.total, `Okupansi ${z.name}`)}
      </div>`)
    .join('');
  $('[data-parking]').innerHTML = `
    <div class="flex items-end gap-2">
      <span class="text-display font-semibold tabular-nums">${p.free}</span>
      <span class="pb-2 text-mid-gray">slot kosong dari ${p.total}</span>
    </div>
    <div class="mt-5 flex flex-1 flex-col justify-around gap-4">${zones}</div>`;
}

function renderEvents() {
  const rows = state.parking.events
    .slice(0, 6)
    .map((ev) => `
      <li class="flex items-center gap-3 py-2.5">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-mono tabular-nums text-[13px] font-medium">${esc(ev.plate)}</span>
          <span class="block truncate text-caption tracking-normal text-mid-gray">${VEHICLE_TYPES[ev.vehicleType].label} · ${esc(ev.gate)} · ${fmtTime(ev.time)}</span>
        </span>
        <span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span>
      </li>`)
    .join('');
  $('[data-events]').innerHTML = `<ul class="-my-2.5 divide-y divide-hairline">${rows}</ul>`;
}

function renderAlerts() {
  const alerts = getAlerts(state.iot, state.parking);
  $('[data-alert-count]').textContent = alerts.length;
  $('[data-alerts]').innerHTML = alertListHtml(alerts, 5);
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
