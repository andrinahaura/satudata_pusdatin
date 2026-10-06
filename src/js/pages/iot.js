import { mountLayout } from '../components/layout.js';
import { createFloorPlan, floorPlanLegend } from '../components/floor-plan.js';
import { floorStackHtml } from '../components/floor-stack.js';
import { createFloorPlan3D } from '../components/three/floor-plan-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { icon, renderIcons } from '../components/icons.js';
import { errorState, segmentedHtml, statTile } from '../components/ui.js';
import { DEVICE_TYPES } from '../data/device-types.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import { devicePowerW, devicesInRoom, findWasteRooms, indexIot, summarizeIot } from '../services/selectors.js';
import { $, esc, getParam, setParams } from '../utils/dom.js';
import { fmt1, fmtRelative, fmtTime } from '../utils/format.js';

mountLayout({ page: 'iot' });

const state = {
  iot: null,
  floorId: getParam('floor') ?? 'L1',
  roomId: getParam('room'),
  filter: 'all',
  search: '',
  pending: new Set(),
  view: getViewMode(),
};

$('[data-floor-legend]').innerHTML = floorPlanLegend();

function selectRoom(roomId) {
  state.roomId = state.roomId === roomId ? null : roomId;
  setParams({ room: state.roomId });
  render();
}

const plans = {
  '3d': createFloorPlan3D($('[data-plan-3d]'), { onRoomSelect: selectRoom }),
  '2d': createFloorPlan($('[data-plan-2d]'), { onRoomSelect: selectRoom }),
};

function renderViewToggle() {
  $('[data-view-toggle]').innerHTML = viewToggleHtml(state.view);
  $('[data-plan-3d]').classList.toggle('hidden', state.view !== '3d');
  $('[data-plan-2d]').classList.toggle('hidden', state.view !== '2d');
}

$('[data-view-toggle]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view-mode]');
  if (!btn) return;
  state.view = btn.dataset.viewMode;
  setViewMode(state.view);
  render();
});

/* ----------------------------- event wiring ----------------------------- */

$('[data-floor-stack]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-floor-id]');
  if (!btn) return;
  state.floorId = btn.dataset.floorId;
  state.roomId = null;
  setParams({ floor: state.floorId, room: null });
  render();
});

$('[data-type-filter]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-type]');
  if (!btn) return;
  state.filter = btn.dataset.type;
  render();
});

$('[data-search]').addEventListener('input', (e) => {
  state.search = e.target.value.trim().toLowerCase();
  renderTable();
});

// Switch & aksi massal (di panel ruangan dan tabel).
document.querySelector('main').addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-toggle]');
  const bulk = e.target.closest('[data-bulk]');
  const close = e.target.closest('[data-room-close]');
  if (close) {
    state.roomId = null;
    setParams({ room: null });
    return render();
  }
  if (sw) {
    const d = state.iot.devices.find((x) => x.id === sw.dataset.toggle);
    await setDevices([d.id], !d.on);
  }
  if (bulk) {
    const ids = bulk.dataset.bulk.split(',');
    await setDevices(ids, bulk.dataset.on === 'true');
  }
});

async function setDevices(ids, on) {
  ids.forEach((id) => state.pending.add(id));
  render();
  try {
    await api.setDevices(ids, on);
    state.iot = await api.getIot();
  } catch (err) {
    console.error(err);
    alertBanner(`Gagal mengubah perangkat: ${err.message}`);
  } finally {
    ids.forEach((id) => state.pending.delete(id));
    render();
  }
}

function alertBanner(message) {
  $('[data-room-panel]').insertAdjacentHTML('afterbegin', `<div class="p-5 pb-0">${errorState(message)}</div>`);
}

/* -------------------------------- render -------------------------------- */

function currentFloor() {
  return state.iot.building.floors.find((f) => f.id === state.floorId) ?? state.iot.building.floors[0];
}

function renderKpis() {
  const s = summarizeIot(state.iot);
  $('[data-kpis]').innerHTML = [
    statTile({ label: 'Perangkat online', value: `${s.online}/${s.totalDevices}`, sub: s.offline ? `${s.offline} offline` : 'Semua terhubung', iconName: 'activity' }),
    statTile({ label: 'Lampu menyala', value: s.byType.light.on, sub: `dari ${s.byType.light.total}`, iconName: 'lightbulb' }),
    statTile({ label: 'AC menyala', value: s.byType.ac.on, sub: `dari ${s.byType.ac.total}`, iconName: 'air-vent' }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%`, iconName: 'thermometer' }),
    statTile({ label: 'Beban listrik', value: fmt1(s.powerKw), unit: 'kW', sub: 'Estimasi realtime', iconName: 'zap' }),
    statTile({ label: 'Penghuni', value: s.people, sub: `${s.occupiedRooms}/${s.workspaceRooms} ruang terpakai`, iconName: 'users' }),
  ].join('');
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.iot.updatedAt)}`;
}

function renderPlan(floor) {
  const s = summarizeIot(state.iot, floor.id);
  $('[data-floor-stack]').innerHTML = floorStackHtml(state.iot, floor.id);
  $('[data-floor-title]').textContent = `${floor.name} · ${floor.label}`;
  $('[data-floor-desc]').textContent = `${s.totalDevices} perangkat · ${s.byType.light.on} lampu & ${s.byType.ac.on} AC menyala · ${fmt1(s.powerKw)} kW`;
  const filters = [{ value: 'all', label: 'Semua' }, ...Object.entries(DEVICE_TYPES).map(([k, m]) => ({ value: k, label: m.label }))];
  $('[data-type-filter]').innerHTML = segmentedHtml(filters, state.filter, 'data-type');
  renderViewToggle();
  plans[state.view].update({ floor, devices: state.iot.devices, selectedRoomId: state.roomId, filter: state.filter });
}

function statusBadge(d) {
  const meta = DEVICE_TYPES[d.type];
  if (!d.online) return `<span class="badge badge-alert">${icon('wifi-off', 'size-3')}Offline</span>`;
  return d.on ? `<span class="badge badge-solid">${meta.onLabel}</span>` : `<span class="badge badge-soft">${meta.offLabel}</span>`;
}

function control(d) {
  const meta = DEVICE_TYPES[d.type];
  if (!meta.controllable) return '<span class="text-caption tracking-normal text-mid-gray">Hanya baca</span>';
  const busy = state.pending.has(d.id);
  return `<button type="button" class="switch" role="switch" aria-checked="${d.on}" aria-label="${esc(d.name)}" data-toggle="${d.id}" ${!d.online || busy ? 'disabled' : ''}></button>`;
}

function bulkButton(devices, on, label, variant = 'btn-outline') {
  const targets = devices.filter((d) => d.online && d.on !== on && DEVICE_TYPES[d.type].controllable);
  if (!targets.length) return '';
  return `<button type="button" class="btn btn-sm ${variant}" data-bulk="${targets.map((d) => d.id).join(',')}" data-on="${on}">${icon('power', 'size-3.5')}${label} (${targets.length})</button>`;
}

function renderRoomPanel(floor) {
  const panel = $('[data-room-panel]');
  const room = floor.rooms.find((r) => r.id === state.roomId);

  if (!room) {
    const s = summarizeIot(state.iot, floor.id);
    const devices = state.iot.devices.filter((d) => d.floorId === floor.id);
    const waste = findWasteRooms(state.iot).filter((w) => w.floor.id === floor.id);
    panel.innerHTML = `
      <div class="card-header"><div><h2 class="card-title">Ringkasan ${esc(floor.name)}</h2><p class="card-desc">Klik ruangan di denah untuk detail.</p></div></div>
      <div class="card-body">
        <dl class="grid grid-cols-2 gap-x-4 gap-y-4">
          ${Object.entries(DEVICE_TYPES).map(([k, m]) => `<div><dt class="text-caption tracking-normal text-mid-gray">${m.label} ${m.onLabel}</dt><dd class="text-subheading font-semibold tabular-nums">${s.byType[k].on}<span class="text-body font-normal text-mid-gray"> / ${s.byType[k].total}</span></dd></div>`).join('')}
          <div><dt class="text-caption tracking-normal text-mid-gray">Penghuni</dt><dd class="text-subheading font-semibold tabular-nums">${s.people}</dd></div>
        </dl>
        ${waste.length ? `<div class="mt-5 rounded-nested border border-hairline p-3">
            <p class="flex items-center gap-2 font-medium">${icon('zap', 'size-4')}${waste.length} ruang kosong masih menyala</p>
            <p class="mt-1 text-caption tracking-normal text-mid-gray">${waste.map((w) => esc(w.room.name)).join(', ')}</p>
            <div class="mt-3">${bulkButton(waste.flatMap((w) => w.devices), false, 'Matikan', 'btn-primary')}</div>
          </div>` : ''}
        <div class="mt-5 flex flex-wrap gap-2">
          ${bulkButton(devices.filter((d) => d.type === 'light'), false, 'Matikan semua lampu')}
          ${bulkButton(devices.filter((d) => d.type === 'ac'), false, 'Matikan semua AC')}
        </div>
      </div>`;
    return;
  }

  const devices = devicesInRoom(state.iot, room.id);
  const power = devices.reduce((a, d) => a + devicePowerW(d), 0);
  const stat = (label, value) => `<div class="rounded-nested bg-canvas p-3"><dt class="text-caption tracking-normal text-mid-gray">${label}</dt><dd class="mt-0.5 text-subheading font-semibold tabular-nums">${value}</dd></div>`;
  panel.innerHTML = `
    <div class="card-header">
      <div class="min-w-0">
        <p class="label-caps">${esc(floor.name)}</p>
        <h2 class="truncate text-subheading font-semibold">${esc(room.name)}</h2>
      </div>
      <button type="button" class="btn btn-ghost btn-icon" data-room-close aria-label="Tutup detail ruangan">${icon('x')}</button>
    </div>
    <div class="card-body">
      <dl class="grid grid-cols-2 gap-2">
        ${stat('Suhu', `${fmt1(room.temperature)}°C`)}
        ${stat('Kelembaban', `${room.humidity}%`)}
        ${stat('Penghuni', room.capacity ? `${room.occupancy}/${room.capacity}` : '–')}
        ${stat('Daya', `${power} W`)}
      </dl>
      <h3 class="label-caps mt-5 mb-1">Perangkat (${devices.length})</h3>
      <ul class="divide-y divide-hairline">
        ${devices.map((d) => `
          <li class="flex items-center gap-3 py-2.5">
            <span class="grid size-8 shrink-0 place-items-center rounded-full border border-hairline ${d.online ? '' : 'text-ember'}">${icon(DEVICE_TYPES[d.type].icon, 'size-4')}</span>
            <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(d.name)}</span><span class="block">${statusBadge(d)}</span></span>
            ${control(d)}
          </li>`).join('') || '<li class="py-3 text-mid-gray">Tidak ada perangkat.</li>'}
      </ul>
      <div class="mt-4 flex flex-wrap gap-2">
        ${bulkButton(devices.filter((d) => d.type !== 'lock'), false, 'Matikan semua')}
        ${bulkButton(devices.filter((d) => d.type !== 'lock'), true, 'Nyalakan semua')}
      </div>
    </div>`;
}

function renderTable() {
  const floor = currentFloor();
  const { rooms } = indexIot(state.iot);
  const q = state.search;
  const list = state.iot.devices.filter((d) => {
    if (d.floorId !== floor.id) return false;
    if (state.filter !== 'all' && d.type !== state.filter) return false;
    if (!q) return true;
    return `${d.name} ${d.id} ${rooms.get(d.roomId).name}`.toLowerCase().includes(q);
  });
  // Perangkat di ruangan terpilih tampil paling atas.
  if (state.roomId) list.sort((a, b) => (b.roomId === state.roomId) - (a.roomId === state.roomId));
  $('[data-table-title]').textContent = `Perangkat ${floor.name}`;
  $('[data-table-desc]').textContent = `${list.length} perangkat${state.filter !== 'all' ? ` · ${DEVICE_TYPES[state.filter].label}` : ''}`;
  $('[data-table-body]').innerHTML =
    list
      .map((d) => {
        const room = rooms.get(d.roomId);
        const selected = d.roomId === state.roomId;
        return `<tr class="${selected ? 'bg-surface-alt' : ''}">
          <td class="px-5 py-2.5"><div class="flex items-center gap-2.5">${icon(DEVICE_TYPES[d.type].icon, `size-4 shrink-0 ${d.online ? 'text-mid-gray' : 'text-ember'}`)}<div><div class="font-medium">${esc(d.name)}</div><div class="font-mono text-[11px] text-mid-gray">${esc(d.id)}</div></div></div></td>
          <td class="px-3 py-2.5">${esc(room.name)}</td>
          <td class="px-3 py-2.5">${statusBadge(d)}</td>
          <td class="px-3 py-2.5 text-right tabular-nums">${devicePowerW(d)} W</td>
          <td class="px-3 py-2.5 text-mid-gray">${fmtRelative(d.lastSeen)}</td>
          <td class="px-5 py-2.5 text-right">${control(d)}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6" class="px-5 py-6 text-center text-mid-gray">Tidak ada perangkat yang cocok.</td></tr>';
  renderIcons($('[data-table-body]'));
}

function render() {
  if (!state.iot) return;
  const floor = currentFloor();
  state.floorId = floor.id;
  if (state.roomId && !floor.rooms.some((r) => r.id === state.roomId)) state.roomId = null;
  renderKpis();
  renderPlan(floor);
  renderRoomPanel(floor);
  renderTable();
  renderIcons($('main'));
}

async function load() {
  try {
    state.iot = await api.getIot();
    render();
  } catch (err) {
    $('[data-kpis]').innerHTML = `<div class="col-span-full">${errorState(`Gagal memuat data IoT: ${err.message}`)}</div>`;
  }
}

api.subscribe((next) => {
  if (!next.iot || state.pending.size) return;
  state.iot = next.iot;
  render();
});
window.addEventListener(DEVICES_CHANGED, async () => {
  state.iot = await api.getIot();
  render();
});

load();
