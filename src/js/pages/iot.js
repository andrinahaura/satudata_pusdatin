import { mountLayout } from '../components/layout.js';
import { createFloorPlan, floorPlanLegend } from '../components/floor-plan.js';
import { floorStackHtml } from '../components/floor-stack.js';
import { createFloorPlan3D } from '../components/three/floor-plan-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { icon, renderIcons } from '../components/icons.js';
import { createLineChart, lineLegendHtml, miniLineChartSvg } from '../components/line-chart.js';
import { powerFlowHtml } from '../components/power-flow.js';
import { errorState, meter, segmentedHtml, statTile } from '../components/ui.js';
import { DEVICE_TYPES } from '../data/device-types.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import {
  devicePowerW, devicesInRoom, ENERGY_PERIODS, energyByFloor, energySeries, findWasteRooms, indexIot,
  roomActivity, roomEnergy, roomRanking, summarizeIot,
} from '../services/selectors.js';
import { $, esc, getParam, setParams } from '../utils/dom.js';
import { fmt1, fmtInt, fmtRelative, fmtTime } from '../utils/format.js';

mountLayout({ page: 'iot' });

const state = {
  iot: null,
  floorId: getParam('floor') ?? 'L1',
  roomId: getParam('room'),
  filter: 'all',
  search: '',
  pending: new Set(),
  view: getViewMode(),
  period: 'harian',
  energyScope: 'all',
};

const rupiah = (v) => `Rp ${fmtInt(Math.round(v))}`;
const pct = (ratio) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${Math.abs(Math.round(ratio * 100))}%`;
const periodMeta = () => ENERGY_PERIODS.find((p) => p.value === state.period);

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
  const e = energyByFloor(state.iot, 'harian');
  $('[data-kpis]').innerHTML = [
    statTile({ label: 'Perangkat online', value: `${s.online}/${s.totalDevices}`, sub: s.offline ? `${s.offline} offline` : 'Semua terhubung' }),
    statTile({ label: 'Lampu menyala', value: s.byType.light.on, sub: `dari ${s.byType.light.total} saklar` }),
    statTile({ label: 'AC menyala', value: s.byType.ac.on, sub: `dari ${s.byType.ac.total} unit` }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%` }),
    statTile({ label: 'Ruang ada orang', value: s.occupiedRooms, unit: ` / ${s.workspaceRooms}`, sub: `${s.rooms - s.equippedRooms} ruang belum bersensor` }),
    statTile({ label: 'Listrik hari ini', value: fmt1(e.kwh), unit: ' kWh', sub: rupiah(e.rupiah) }),
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
  if (!d.online) return '<span class="badge badge-alert">Offline</span>';
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
  return `<button type="button" class="btn btn-sm ${variant}" data-bulk="${targets.map((d) => d.id).join(',')}" data-on="${on}">${label} (${targets.length})</button>`;
}

function renderRoomPanel(floor) {
  const panel = $('[data-room-panel]');
  const room = floor.rooms.find((r) => r.id === state.roomId);

  if (!room) {
    const s = summarizeIot(state.iot, floor.id);
    const devices = state.iot.devices.filter((d) => d.floorId === floor.id);
    const waste = findWasteRooms(state.iot).filter((w) => w.floor.id === floor.id);
    const floorEnergy = energyByFloor(state.iot, 'harian').floors.find((f) => f.floor.id === floor.id);
    panel.innerHTML = `
      <div class="card-header"><h2 class="card-title">Ringkasan ${esc(floor.name)}</h2></div>
      <div class="card-body">
        <dl class="grid grid-cols-2 gap-x-4 gap-y-4">
          ${Object.entries(DEVICE_TYPES).map(([k, m]) => `<div><dt class="text-caption tracking-normal text-mid-gray">${k === 'presence' ? 'Ruang ada orang' : `${m.label} ${m.onLabel}`}</dt><dd class="text-subheading font-semibold tabular-nums">${s.byType[k].on}<span class="text-body font-normal text-mid-gray"> / ${s.byType[k].total}</span></dd></div>`).join('')}
          <div><dt class="text-caption tracking-normal text-mid-gray">Penghuni</dt><dd class="text-subheading font-semibold tabular-nums">${s.people}</dd></div>
          <div><dt class="text-caption tracking-normal text-mid-gray">Listrik hari ini</dt><dd class="text-subheading font-semibold tabular-nums">${fmt1(floorEnergy.kwh)}<span class="text-body font-normal text-mid-gray"> kWh</span></dd></div>
        </dl>
        ${waste.length ? `<div class="mt-5 rounded-nested border border-hairline p-3">
            <p class="font-medium">${waste.length} ruang kosong masih menyala</p>
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
  const presence = room.occupancy == null ? '–' : room.occupancy > 0 ? (room.capacity ? `${room.occupancy} orang` : 'Ada orang') : 'Kosong';
  const energy = devices.length ? roomEnergy(state.iot, room.id) : null;
  const activity = roomActivity(state.iot, room.id, 8);
  const controllable = devices.filter((d) => DEVICE_TYPES[d.type].controllable);
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
        ${stat('Suhu', room.temperature != null ? `${fmt1(room.temperature)}°C` : '–')}
        ${stat('Kelembaban', room.humidity != null ? `${room.humidity}%` : '–')}
        ${stat('Kehadiran', presence)}
        ${stat('Daya', `${power} W`)}
      </dl>
      ${!room.equipped ? '<p class="mt-4 rounded-nested border border-hairline px-3 py-2.5 text-mid-gray">Sensor belum terpasang di ruang ini.</p>' : ''}
      ${energy ? `
        <h3 class="label-caps mt-5 mb-2">Pemakaian listrik</h3>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1">
          <div><dt class="text-caption tracking-normal text-mid-gray">Hari ini</dt><dd class="font-semibold tabular-nums">${fmt1(energy.today)} kWh <span class="font-normal text-mid-gray">${rupiah(energy.todayRupiah)}</span></dd></div>
          <div><dt class="text-caption tracking-normal text-mid-gray">Kemarin</dt><dd class="font-semibold tabular-nums">${fmt1(energy.yesterday)} kWh <span class="font-normal text-mid-gray">${rupiah(energy.yesterdayRupiah)}</span></dd></div>
        </dl>
        <div class="mt-3">${miniLineChartSvg({ series: [
          { style: 'target', values: energy.series.target },
          { style: 'previous', values: energy.series.previous },
          { style: 'current', values: energy.series.current },
        ] })}</div>
        <div class="mt-2">${lineLegendHtml([{ label: 'Hari ini', style: 'current' }, { label: 'Kemarin', style: 'previous' }, { label: 'Target', style: 'target' }])}</div>` : ''}
      <h3 class="label-caps mt-5 mb-1">Perangkat (${devices.length})</h3>
      <ul class="divide-y divide-hairline">
        ${devices.map((d) => `
          <li class="flex items-center gap-3 py-2.5">
            <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(d.name)}</span><span class="block">${statusBadge(d)}</span></span>
            ${control(d)}
          </li>`).join('') || '<li class="py-3 text-mid-gray">Belum ada perangkat terdaftar.</li>'}
      </ul>
      <div class="mt-4 flex flex-wrap gap-2">
        ${bulkButton(controllable, false, 'Matikan semua')}
        ${bulkButton(controllable, true, 'Nyalakan semua')}
      </div>
      ${room.equipped ? `
        <h3 class="label-caps mt-6 mb-1">Riwayat aktivitas hari ini</h3>
        <ol class="divide-y divide-hairline">
          ${activity.map((a) => `<li class="flex gap-3 py-2"><span class="w-11 shrink-0 text-mid-gray tabular-nums">${fmtTime(a.time)}</span><span class="min-w-0">${esc(a.text)}</span></li>`).join('') || '<li class="py-2 text-mid-gray">Belum ada aktivitas.</li>'}
        </ol>` : ''}
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
          <td class="px-5 py-2.5"><div class="font-medium">${esc(d.name)}</div><div class="font-mono tabular-nums text-[11px] text-mid-gray">${esc(d.id)}</div></td>
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

/* -------------------------------- listrik -------------------------------- */

let energyChart = null;

function renderEnergy() {
  const period = periodMeta();
  const e = energyByFloor(state.iot, state.period);
  const trafo = state.iot.energy.panels.find((p) => p.source);
  $('[data-period-tabs]').innerHTML = segmentedHtml(ENERGY_PERIODS, state.period, 'data-period');

  const diff = e.rupiah - e.previousToDate * e.tariff;
  $('[data-energy-kpis]').innerHTML = [
    statTile({ label: `Pemakaian ${period.current.toLowerCase()}`, value: fmt1(e.kwh), unit: ' kWh', sub: `${pct(e.change)} vs ${period.previous.toLowerCase()}` }),
    statTile({ label: 'Biaya', value: rupiah(e.rupiah), sub: `Tarif ${rupiah(e.tariff)}/kWh` }),
    statTile({ label: diff <= 0 ? 'Penghematan' : 'Kenaikan biaya', value: rupiah(Math.abs(diff)), sub: `Dibanding ${period.previous.toLowerCase()}` }),
    statTile({ label: 'Beban saat ini', value: fmt1(trafo.kw), unit: ' kW', sub: `Trafo induk · ${fmt1(trafo.current)} A` }),
  ].join('');

  const scopes = [{ value: 'all', label: 'Gedung' }, ...state.iot.building.floors.map((f) => ({ value: f.id, label: f.short }))];
  $('[data-energy-scope]').innerHTML = segmentedHtml(scopes, state.energyScope, 'data-energy-scope-id');
  const scopeFloor = state.iot.building.floors.find((f) => f.id === state.energyScope);
  const series = energySeries(state.iot, state.period, scopeFloor?.id ?? null);
  const lines = [
    series.target && { label: 'Target', values: series.target, style: 'target' },
    { label: period.previous, values: series.previous, style: 'previous' },
    { label: period.current, values: series.current, style: 'current' },
  ].filter(Boolean);
  $('[data-energy-chart-desc]').textContent = `${scopeFloor?.name ?? 'Seluruh gedung'} · kWh per ${state.period === 'harian' ? 'jam' : 'hari'}`;
  const chartOpts = { labels: series.labels, series: lines, height: 240, format: (v) => `${fmt1(v)} kWh`, tickFormat: (v) => fmt1(v) };
  if (energyChart) energyChart.update(chartOpts);
  else energyChart = createLineChart($('[data-energy-chart]'), chartOpts);
  $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());

  $('[data-segment-desc]').textContent = `${period.current} · porsi dari ${fmt1(e.kwh)} kWh`;
  $('[data-energy-floors]').innerHTML = e.floors
    .map((f) => `<div>
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="flex items-center gap-2 font-medium">${esc(f.floor.name)}${f.anomaly && state.period === 'harian' ? '<span class="badge badge-alert">Di atas target</span>' : ''}</span>
          <span class="tabular-nums"><span class="font-medium">${fmt1(f.kwh)}</span> <span class="text-mid-gray">kWh</span></span>
        </div>
        ${meter(f.share, `Porsi ${f.floor.name}`)}
        <p class="mt-1.5 flex justify-between gap-2 text-caption tracking-normal text-mid-gray tabular-nums"><span>${rupiah(f.rupiah)} · ${Math.round(f.share * 100)}%</span><span>${pct(f.change)} vs ${period.previous.toLowerCase()}</span></p>
      </div>`)
    .join('');

  $('[data-power-flow]').innerHTML = powerFlowHtml(state.iot.energy);

  const ranking = roomRanking(state.iot, state.period);
  const rankRow = (r, i) => `<li>
      <a href="?floor=${r.floor.id}&room=${r.room.id}" class="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-canvas" data-rank-room="${r.room.id}" data-rank-floor="${r.floor.id}">
        <span class="w-5 shrink-0 text-mid-gray tabular-nums">${i}</span>
        <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(r.room.name)}</span><span class="block text-caption tracking-normal text-mid-gray">${esc(r.floor.name)}</span></span>
        <span class="text-right tabular-nums"><span class="block font-medium">${fmt1(r.kwh)} kWh</span><span class="block text-caption tracking-normal text-mid-gray">${rupiah(r.rupiah)}</span></span>
      </a>
    </li>`;
  $('[data-rank-desc]').textContent = `${period.current} · seluruh lantai`;
  $('[data-rank-desc-low]').textContent = `${period.current} · ruang dengan perangkat`;
  $('[data-rank-top]').innerHTML = ranking.slice(0, 5).map((r, i) => rankRow(r, i + 1)).join('');
  $('[data-rank-low]').innerHTML = ranking.slice(-5).reverse().map((r, i) => rankRow(r, ranking.length - i)).join('');
}

$('[data-period-tabs]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-period]');
  if (!btn) return;
  state.period = btn.dataset.period;
  renderEnergy();
});

$('[data-energy-scope]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-energy-scope-id]');
  if (!btn) return;
  state.energyScope = btn.dataset.energyScopeId;
  renderEnergy();
});

document.querySelectorAll('[data-rank-top], [data-rank-low]').forEach((list) =>
  list.addEventListener('click', (e) => {
    const link = e.target.closest('[data-rank-room]');
    if (!link) return;
    e.preventDefault();
    state.floorId = link.dataset.rankFloor;
    state.roomId = link.dataset.rankRoom;
    setParams({ floor: state.floorId, room: state.roomId });
    render();
    $('[data-room-panel]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }),
);

function render() {
  if (!state.iot) return;
  const floor = currentFloor();
  state.floorId = floor.id;
  if (state.roomId && !floor.rooms.some((r) => r.id === state.roomId)) state.roomId = null;
  renderKpis();
  renderPlan(floor);
  renderRoomPanel(floor);
  renderTable();
  renderEnergy();
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
