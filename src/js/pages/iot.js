import { mountLayout } from '../components/layout.js';
import { createFloorPlan, floorPlanLegend } from '../components/floor-plan.js';
import { createFloorPlan3D } from '../components/three/floor-plan-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { icon, renderIcons } from '../components/icons.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { createTrendChart } from '../components/trend-chart.js';
import { createAlertPanel } from '../components/alert-panel.js';
import { createDateRange } from '../components/date-range.js';
import { errorState, floorTargetCell, segmentedHtml, statTile } from '../components/ui.js';
import { DEVICE_TYPES } from '../data/device-types.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import {
  devicePowerW, devicesInRoom, deviceUptime, energyByFloor, energyRange, findWasteRooms, getAlerts, indexIot,
  roomActivity, summarizeIot,
} from '../services/selectors.js';
import { $, esc, getParam, setParams } from '../utils/dom.js';
import { fmt1, fmtDateTime, fmtDuration, fmtInt, fmtRelative, fmtTime } from '../utils/format.js';
import { rangeQuery } from '../utils/range.js';

mountLayout({ page: 'iot' });

const state = {
  iot: null,
  parking: null,
  history: null,
  notifications: null,
  logKind: 'status',
  logFloor: 'all',
  logSearch: '',
  floorId: getParam('floor') ?? 'L1',
  roomId: getParam('room'),
  filter: 'all',
  search: '',
  pending: new Set(),
  view: getViewMode(),
  energy: null,
  energyScope: 'all',
};

const rupiah = (v) => `Rp ${fmtInt(Math.round(v))}`;
const pct = (ratio) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${Math.abs(Math.round(ratio * 100))}%`;

// Rentang waktu berlaku untuk log notifikasi, riwayat perangkat, dan listrik.
// Denah, tabel perangkat, KPI atas, dan peringatan aktif selalu menampilkan kondisi saat ini.
const picker = createDateRange($('[data-range]'), {
  onChange: async () => {
    await loadExtras();
    render();
  },
});

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

$('[data-floor-tabs]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-floor]');
  if (!btn) return;
  state.floorId = btn.dataset.floor;
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
    [state.iot] = await Promise.all([api.getIot(), loadExtras()]);
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
    statTile({ label: 'Perangkat online', value: s.online, unit: ` / ${s.totalDevices}`, sub: s.offline ? `${s.offline} offline` : '' }),
    statTile({ label: 'Lampu menyala', value: s.byType.light.on, unit: ` / ${s.byType.light.total}` }),
    statTile({ label: 'AC menyala', value: s.byType.ac.on, unit: ` / ${s.byType.ac.total}` }),
    statTile({ label: 'Suhu rata-rata', value: fmt1(s.avgTemp), unit: '°C', sub: `Kelembaban ${Math.round(s.avgHumidity)}%` }),
    statTile({ label: 'Ruang ada orang', value: s.occupiedRooms, unit: ` / ${s.workspaceRooms}` }),
    statTile({ label: 'Listrik hari ini', value: fmt1(e.kwh), unit: ' kWh', sub: rupiah(e.rupiah) }),
  ].join('');
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.iot.updatedAt)}`;
}

function renderPlan(floor) {
  $('[data-floor-tabs]').innerHTML = segmentedHtml(state.iot.building.floors.map((f) => ({ value: f.id, label: f.short })), floor.id, 'data-floor');
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
  const activity = roomActivity(state.iot, room.id, 8);
  const controllable = devices.filter((d) => DEVICE_TYPES[d.type].controllable);
  panel.innerHTML = `
    <div class="card-header">
      <h2 class="min-w-0 truncate text-subheading font-semibold">${esc(room.name)}</h2>
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
      <h3 class="mt-5 mb-1 font-semibold">Perangkat <span class="font-normal text-mid-gray">${devices.length}</span></h3>
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
        <h3 class="mt-6 mb-1 font-semibold">Riwayat aktivitas hari ini</h3>
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
  $('[data-table-title]').innerHTML = `Perangkat ${esc(floor.name)} <span class="font-normal text-mid-gray">${list.length}</span>`;
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
  if (!state.energy) return;
  const range = picker.range;
  const e = energyRange(state.iot, state.energy, range);
  const trafo = state.iot.energy.panels.find((p) => p.source);
  const prev = range.previousLabel.toLowerCase();

  const diff = e.rupiah - e.previousRupiah;
  $('[data-energy-kpis]').innerHTML = [
    statTile({ label: `Pemakaian ${range.short}`, value: fmt1(e.kwh), unit: ' kWh', sub: `${pct(e.change)} vs ${prev}` }),
    statTile({ label: 'Biaya', value: rupiah(e.rupiah), sub: range.label }),
    statTile({ label: diff <= 0 ? `Hemat vs ${prev}` : `Naik vs ${prev}`, value: rupiah(Math.abs(diff)) }),
    statTile({ label: 'Beban saat ini', value: fmt1(trafo.kw), unit: ' kW', sub: 'Saat ini' }),
  ].join('');

  const scopes = [{ value: 'all', label: 'Gedung' }, ...state.iot.building.floors.map((f) => ({ value: f.id, label: f.short }))];
  $('[data-energy-scope]').innerHTML = segmentedHtml(scopes, state.energyScope, 'data-energy-scope-id');
  const scopeFloor = state.iot.building.floors.find((f) => f.id === state.energyScope);
  const series = e.seriesFor(scopeFloor?.id ?? null);
  const lines = [
    series.target && { label: 'Target', values: series.target, style: 'target' },
    { label: range.previousLabel, values: series.previous, style: 'previous' },
    { label: range.currentLabel, values: series.current, style: 'current' },
  ].filter(Boolean);
  const chartOpts = { labels: series.labels, series: lines, height: 260, format: (v) => `${fmt1(v)} kWh` };
  if (energyChart) energyChart.update(chartOpts);
  else energyChart = createTrendChart($('[data-energy-chart]'), chartOpts);
  $('[data-energy-legend]').innerHTML = lineLegendHtml([...lines].reverse());

  $('[data-prev-head]').textContent = `vs ${prev}`;
  $('[data-energy-floors]').innerHTML = e.floors
    .map((f) => `<tr>
        <td>${range.preset === 'today' ? floorTargetCell(f, { fmt: fmt1 }) : `<span class="font-medium">${esc(f.floor.name)}</span>`}</td>
        <td class="num">${fmt1(f.kwh)}</td>
        <td class="num">${rupiah(f.rupiah)}</td>
        <td class="num">${Math.round(f.share * 100)}%</td>
        <td class="num text-mid-gray">${pct(f.change)}</td>
      </tr>`)
    .join('');

  $('[data-energy-floors-total]').innerHTML = `<tr><td>Total</td><td class="num">${fmt1(e.kwh)}</td><td class="num">${rupiah(e.rupiah)}</td><td class="num">100%</td><td class="num">${pct(e.change)}</td></tr>`;

  const fmt2 = (n) => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('[data-power-panels]').innerHTML = state.iot.energy.panels
    .map((p) => `<tr class="${p.source ? 'bg-surface-alt' : ''}">
        <td><span class="font-medium ${p.source ? '' : 'pl-3'}">${esc(p.name)}</span> <span class="text-caption tracking-normal text-mid-gray">${esc(p.meter)}</span>${p.online ? '' : ' <span class="badge badge-alert">Offline</span>'}</td>
        <td class="num">${fmt1(p.kw)} kW</td>
        <td class="num">${fmt1(p.kwhToday)}</td>
        <td class="num">${rupiah(p.kwhToday * state.iot.energy.tariff)}</td>
        <td class="num">${fmt1(p.voltage)} V</td>
        <td class="num">${fmt1(p.current)} A</td>
        <td class="num">${fmt2(p.pf)}</td>
      </tr>`)
    .join('');
}

$('[data-energy-scope]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-energy-scope-id]');
  if (!btn) return;
  state.energyScope = btn.dataset.energyScopeId;
  renderEnergy();
});

/* ------------------------- peringatan & telegram ------------------------- */

const alertPanel = createAlertPanel($('[data-alert-panel]'));

function monitoredChecks() {
  const s = summarizeIot(state.iot);
  const temps = state.iot.building.floors.flatMap((f) => f.rooms).map((r) => r.temperature).filter((t) => t != null);
  return [
    { label: 'Perangkat online', value: `${s.online}/${s.totalDevices}` },
    { label: 'Suhu ruang tertinggi', value: `${fmt1(Math.max(...temps))}°C` },
    { label: 'Listrik per lantai', value: 'Sesuai target' },
    { label: 'Ruang kosong menyala', value: 'Tidak ada' },
  ];
}

function renderAlerts() {
  alertPanel.update(getAlerts(state.iot, state.parking), { checks: monitoredChecks(), checkedAt: fmtTime(state.iot.updatedAt) });
}

const TG_STATUS = {
  sent: '<span class="badge badge-solid">Terkirim</span>',
  skipped: '<span class="badge badge-soft">Tidak dikirim</span>',
  failed: '<span class="badge badge-alert">Gagal</span>',
};
const TG_KIND = { alert: '', resolved: 'Pulih · ', test: '' };

function renderTelegram() {
  const n = state.notifications;
  if (!n) return;
  const { channel, settings } = n;
  $('[data-tg-channel]').textContent = `${channel.bot} ke ${channel.chat}`;
  $('[data-tg-status]').innerHTML = channel.connected ? '<span class="badge badge-outline">Terhubung</span>' : '<span class="badge badge-alert">Terputus</span>';
  const row = (key, label, desc, disabled = false) => `<div class="flex items-center justify-between gap-3 px-3 py-2.5">
      <span class="min-w-0"><span class="block font-medium">${label}</span><span class="block text-caption tracking-normal text-mid-gray">${desc}</span></span>
      <button type="button" class="switch" role="switch" aria-checked="${settings[key]}" aria-label="${label}" data-tg-setting="${key}" ${disabled ? 'disabled' : ''}></button>
    </div>`;
  $('[data-tg-settings]').innerHTML = [
    row('enabled', 'Kirim ke Telegram', 'Peringatan baru dan pemulihan dikirim ke grup'),
    row('critical', 'Tingkat Kritis', 'Perangkat offline, suhu tinggi', !settings.enabled),
    row('warning', 'Tingkat Perhatian', 'Listrik di atas target, ruang kosong menyala', !settings.enabled),
  ].join('');
  const sent = n.items.filter((i) => i.status === 'sent').length;
  $('[data-tg-count]').textContent = `${fmtInt(sent)} pesan terkirim ${picker.range.short}`;
  $('[data-tg-log]').innerHTML =
    n.items
      .slice(0, 40)
      .map((i) => `<tr>
          <td class="align-top whitespace-nowrap text-mid-gray">${fmtTime(i.time)}</td>
          <td class="min-w-0"><span class="block font-medium">${TG_KIND[i.kind] ?? ''}${esc(i.title)}</span><span class="block text-caption tracking-normal text-mid-gray">${esc(i.meta)}</span></td>
          <td class="num align-top">${TG_STATUS[i.status] ?? ''}</td>
        </tr>`)
      .join('') || '<tr><td colspan="3" class="py-6 text-center text-mid-gray">Belum ada notifikasi.</td></tr>';
}

$('[data-tg-settings]').addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-tg-setting]');
  if (!sw || !state.notifications) return;
  const key = sw.dataset.tgSetting;
  const value = !state.notifications.settings[key];
  state.notifications.settings[key] = value;
  renderTelegram();
  try {
    state.notifications.settings = await api.updateNotificationSettings({ [key]: value });
  } catch (err) {
    state.notifications.settings[key] = !value;
    console.error(err);
  }
  renderTelegram();
});

$('[data-tg-test]').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Mengirim…';
  try {
    await api.sendTestNotification();
    state.notifications = await api.getNotifications(rangeQuery(picker.range));
    btn.textContent = 'Pesan uji terkirim';
  } catch (err) {
    btn.textContent = 'Gagal mengirim';
    console.error(err);
  }
  renderTelegram();
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Kirim pesan uji';
  }, 2500);
});

/* --------------------------- riwayat perangkat --------------------------- */

let uptimeChart = null;
const pct2 = (ratio) => `${(ratio * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

function renderHistory() {
  if (!state.history) return;
  const range = picker.range;
  const u = deviceUptime(state.history, state.iot, range);
  const { rooms } = indexIot(state.iot);
  const roomName = (id) => rooms.get(id)?.name ?? '–';

  $('[data-uptime-kpis]').innerHTML = [
    statTile({ label: `Uptime ${range.short}`, value: pct2(u.overall), sub: `${state.iot.devices.length} perangkat` }),
    statTile({ label: 'Gangguan koneksi', value: fmtInt(u.outages), sub: range.label }),
    statTile({ label: 'Terputus saat ini', value: u.disconnected, unit: ' perangkat', alert: u.disconnected > 0 }),
    statTile({ label: 'Total waktu terputus', value: fmtDuration(u.downMs / 60000), sub: 'Dijumlah dari semua perangkat' }),
  ].join('');

  $('[data-uptime-desc]').textContent = `Porsi waktu perangkat terhubung ${range.single ? 'per jam' : 'per hari'}, ${range.label}`;
  const opts = {
    labels: u.buckets.map((b) => b.label),
    series: [{ label: 'Uptime', values: u.buckets.map((b) => (b.ratio == null ? null : b.ratio * 100)), style: 'current' }],
    height: 240,
    format: (v) => `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% terhubung`,
  };
  if (uptimeChart) uptimeChart.update(opts);
  else uptimeChart = createTrendChart($('[data-uptime-chart]'), opts);

  $('[data-uptime-low]').innerHTML = u.devices
    .slice(0, 6)
    .map((r) => `<tr>
        <td><span class="block font-medium">${esc(r.device.name)} <span class="font-normal text-mid-gray">· ${esc(roomName(r.device.roomId))}</span></span><span class="block font-mono text-[11px] text-mid-gray">${esc(r.device.id)}</span></td>
        <td class="num font-medium">${pct2(r.uptime)}</td>
        <td class="num">${r.outages}</td>
        <td class="whitespace-nowrap">${r.last ? (r.last.end ? `<span class="text-mid-gray">${fmtDateTime(r.last.start)}</span>` : '<span class="badge badge-alert">Masih terputus</span>') : '–'}</td>
      </tr>`)
    .join('');

  renderLog();
}

// Tabel menampilkan baris terbaru saja; judul menyebut jumlah seluruhnya.
const LOG_ROWS = 150;
function logCount(total, truncated = false) {
  const n = `${fmtInt(total)}${truncated ? '+' : ''}`;
  return total > LOG_ROWS ? `${n} · ${LOG_ROWS} terbaru` : n;
}

function renderLog() {
  const kinds = [{ value: 'status', label: 'Status perangkat' }, { value: 'connection', label: 'Konektivitas' }];
  $('[data-log-kind]').innerHTML = segmentedHtml(kinds, state.logKind, 'data-log-kind-id');
  const floors = [{ value: 'all', label: 'Semua' }, ...state.iot.building.floors.map((f) => ({ value: f.id, label: f.short }))];
  $('[data-log-floor]').innerHTML = segmentedHtml(floors, state.logFloor, 'data-log-floor-id');

  const { rooms } = indexIot(state.iot);
  const devices = new Map(state.iot.devices.map((d) => [d.id, d]));
  const q = state.logSearch;
  const match = (e) => {
    if (state.logFloor !== 'all' && e.floorId !== state.logFloor) return false;
    if (!q) return true;
    return `${devices.get(e.deviceId)?.name ?? ''} ${e.deviceId} ${rooms.get(e.roomId)?.name ?? ''}`.toLowerCase().includes(q);
  };
  const deviceCell = (e) => `<span class="block font-medium">${esc(devices.get(e.deviceId)?.name ?? e.deviceId)}</span><span class="block font-mono text-[11px] text-mid-gray">${esc(e.deviceId)}</span>`;
  const roomCell = (e) => `${esc(rooms.get(e.roomId)?.name ?? '–')} <span class="text-mid-gray">· ${esc(state.iot.building.floors.find((f) => f.id === e.floorId)?.short ?? '')}</span>`;

  if (state.logKind === 'status') {
    const all = state.history.statusLog.filter(match);
    const list = all.slice(0, LOG_ROWS);
    $('[data-log-title]').innerHTML = `Riwayat <span class="font-normal text-mid-gray">${logCount(all.length, state.history.statusTotal > state.history.statusLog.length)}</span>`;
    $('[data-log-head]').innerHTML = '<tr><th>Waktu</th><th>Perangkat</th><th>Ruangan</th><th>Status</th></tr>';
    $('[data-log-body]').innerHTML =
      list
        .map((e) => {
          const meta = DEVICE_TYPES[e.type];
          return `<tr>
            <td class="whitespace-nowrap text-mid-gray">${fmtDateTime(e.time)}</td>
            <td>${deviceCell(e)}</td>
            <td>${roomCell(e)}</td>
            <td>${e.on ? `<span class="badge badge-solid">Aktif · ${meta.onLabel}</span>` : `<span class="badge badge-soft">Tidak aktif · ${meta.offLabel}</span>`}</td>
          </tr>`;
        })
        .join('') || '<tr><td colspan="4" class="py-6 text-center text-mid-gray">Tidak ada riwayat yang cocok.</td></tr>';
    return;
  }

  const now = Date.now();
  const all = state.history.outages.filter(match);
  const list = all.slice(0, LOG_ROWS);
  $('[data-log-title]').innerHTML = `Riwayat <span class="font-normal text-mid-gray">${logCount(all.length)}</span>`;
  $('[data-log-head]').innerHTML = '<tr><th>Terputus</th><th>Perangkat</th><th>Ruangan</th><th>Tersambung lagi</th><th class="num">Durasi</th></tr>';
  $('[data-log-body]').innerHTML =
    list
      .map((o) => `<tr>
          <td class="whitespace-nowrap text-mid-gray">${fmtDateTime(o.start)}</td>
          <td>${deviceCell(o)}</td>
          <td>${roomCell(o)}</td>
          <td class="whitespace-nowrap">${o.end ? fmtDateTime(o.end) : '<span class="badge badge-alert">Masih terputus</span>'}</td>
          <td class="num">${fmtDuration(((o.end ? new Date(o.end).getTime() : now) - new Date(o.start).getTime()) / 60000)}</td>
        </tr>`)
      .join('') || '<tr><td colspan="5" class="py-6 text-center text-mid-gray">Tidak ada gangguan koneksi.</td></tr>';
}

$('[data-log-kind]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-log-kind-id]');
  if (!btn) return;
  state.logKind = btn.dataset.logKindId;
  renderLog();
});
$('[data-log-floor]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-log-floor-id]');
  if (!btn) return;
  state.logFloor = btn.dataset.logFloorId;
  renderLog();
});
$('[data-log-search]').addEventListener('input', (e) => {
  state.logSearch = e.target.value.trim().toLowerCase();
  renderLog();
});

function render() {
  if (!state.iot) return;
  const floor = currentFloor();
  state.floorId = floor.id;
  if (state.roomId && !floor.rooms.some((r) => r.id === state.roomId)) state.roomId = null;
  renderKpis();
  renderPlan(floor);
  renderRoomPanel(floor);
  renderTable();
  renderAlerts();
  renderTelegram();
  renderHistory();
  renderEnergy();
  renderIcons($('main'));
}

// Data pendukung (parkir untuk peringatan, riwayat, notifikasi) dimuat bersama dan tiap pembaruan.
async function loadExtras() {
  const range = picker.range;
  const q = rangeQuery(range);
  const res = await Promise.all([api.getParking(), api.getIotHistory(q), api.getNotifications(q), api.getEnergyHistory(rangeQuery(range, { withPrevious: true }))]);
  // Rentang sudah diganti lagi selama memuat: hasil ini sudah basi.
  if (picker.range.label !== range.label) return;
  [state.parking, state.history, state.notifications, state.energy] = res;
}

async function load() {
  try {
    [state.iot] = await Promise.all([api.getIot(), loadExtras()]);
    render();
  } catch (err) {
    $('[data-kpis]').innerHTML = `<div class="col-span-full">${errorState(`Gagal memuat data IoT: ${err.message}`)}</div>`;
  }
}

api.subscribe(async (next) => {
  if (!next.iot || state.pending.size) return;
  state.iot = next.iot;
  try {
    await loadExtras();
  } catch (err) {
    console.warn('[iot] gagal memuat riwayat/notifikasi', err);
  }
  render();
});
window.addEventListener(DEVICES_CHANGED, async () => {
  [state.iot] = await Promise.all([api.getIot(), loadExtras()]);
  render();
});

load();
