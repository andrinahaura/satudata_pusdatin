import { mountLayout } from '../components/layout.js';
import { createChat } from '../components/chat.js';
import { createFloorPlan, floorPlanLegend } from '../components/floor-plan.js';
import { icon, renderIcons } from '../components/icons.js';
import { alertListHtml, errorState, meter, segmentedHtml, statTile } from '../components/ui.js';
import { VEHICLE_TYPES } from '../data/device-types.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import { getAlerts, summarizeIot, summarizeParking } from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmt1, fmtDate, fmtPct, fmtTime, greeting } from '../utils/format.js';

mountLayout({ page: 'home' });

const state = { iot: null, parking: null, floorId: 'L1' };

$('[data-today]').textContent = fmtDate();
$('[data-greeting]').textContent = greeting();
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

function renderKpis() {
  const s = summarizeIot(state.iot);
  const p = summarizeParking(state.parking);
  $('[data-kpis]').innerHTML = [
    statTile({ label: 'Perangkat online', value: `${s.online}/${s.totalDevices}`, sub: s.offline ? `${s.offline} perangkat offline` : 'Semua terhubung', iconName: 'activity' }),
    statTile({ label: 'Lampu menyala', value: s.byType.light.on, sub: `dari ${s.byType.light.total} lampu`, iconName: 'lightbulb' }),
    statTile({ label: 'AC menyala', value: s.byType.ac.on, sub: `dari ${s.byType.ac.total} unit`, iconName: 'air-vent' }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%`, iconName: 'thermometer' }),
    statTile({ label: 'Beban listrik', value: fmt1(s.powerKw), unit: 'kW', sub: `${s.people} orang di gedung`, iconName: 'zap' }),
    statTile({ label: 'Parkir kosong', value: p.free, unit: ` / ${p.total}`, sub: `Okupansi ${fmtPct(p.rate)}`, iconName: 'square-parking' }),
  ].join('');
}

function renderFloor() {
  const floors = state.iot.building.floors;
  const floor = floors.find((f) => f.id === state.floorId) ?? floors[0];
  $('[data-floor-tabs]').innerHTML = segmentedHtml(floors.map((f) => ({ value: f.id, label: `Lt ${f.level}` })), floor.id, 'data-floor');
  const s = summarizeIot(state.iot, floor.id);
  $('[data-floor-desc]').textContent = `${floor.name} · ${floor.label} — ${s.byType.light.on} lampu menyala, ${s.people} orang`;
  plan.update({ floor, devices: state.iot.devices });
}

function renderParking() {
  const p = summarizeParking(state.parking);
  const zones = p.zones
    .map((z) => `
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="flex items-center gap-2 font-medium">${icon(z.kind === 'car' ? 'car' : 'bike', 'size-4 text-mid-gray')}${esc(z.name)}</span>
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
    <div class="mt-5 flex flex-col gap-4">${zones}</div>`;
}

function renderEvents() {
  const rows = state.parking.events
    .slice(0, 6)
    .map((ev) => `
      <li class="flex items-center gap-3 py-2.5">
        <span class="grid size-8 shrink-0 place-items-center rounded-full border border-hairline">${icon(VEHICLE_TYPES[ev.vehicleType].icon, 'size-4')}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-mono text-[13px] font-medium">${esc(ev.plate)}</span>
          <span class="block truncate text-caption tracking-normal text-mid-gray">${esc(ev.gate)} · ${fmtTime(ev.time)}</span>
        </span>
        <span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${icon(ev.direction === 'in' ? 'log-in' : 'log-out', 'size-3')}${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span>
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
    $('[data-kpis]').innerHTML = `<div class="col-span-full">${errorState(`Gagal memuat data: ${err.message}`)}</div>`;
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
