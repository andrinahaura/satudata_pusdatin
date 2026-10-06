// Fungsi turunan murni dari snapshot data. Dipakai halaman, komponen, dan chat engine.
import { DEVICE_TYPES, DEVICE_TYPE_KEYS, NON_WORKSPACE } from '../data/device-types.js';
import { fmt1 } from '../utils/format.js';

export const isWorkspace = (room) => !NON_WORKSPACE.has(room.type);

export function indexIot(iot) {
  const floors = new Map(iot.building.floors.map((f) => [f.id, f]));
  const rooms = new Map(iot.building.floors.flatMap((f) => f.rooms.map((r) => [r.id, r])));
  return { floors, rooms };
}

export const devicePowerW = (d) => (d.on && d.online ? DEVICE_TYPES[d.type].watt : 0);

function emptyTypeCounts() {
  return Object.fromEntries(DEVICE_TYPE_KEYS.map((t) => [t, { total: 0, on: 0, offline: 0 }]));
}

// Ringkasan untuk seluruh gedung, atau satu lantai bila floorId diisi.
export function summarizeIot(iot, floorId = null) {
  const floors = floorId ? iot.building.floors.filter((f) => f.id === floorId) : iot.building.floors;
  const rooms = floors.flatMap((f) => f.rooms);
  const devices = iot.devices.filter((d) => !floorId || d.floorId === floorId);
  const byType = emptyTypeCounts();
  let online = 0;
  let powerW = 0;
  for (const d of devices) {
    const t = byType[d.type];
    t.total += 1;
    if (d.online) online += 1;
    else t.offline += 1;
    if (d.on && d.online) t.on += 1;
    powerW += devicePowerW(d);
  }
  const sensed = rooms.filter((r) => r.temperature != null);
  const avgTemp = sensed.length ? sensed.reduce((s, r) => s + r.temperature, 0) / sensed.length : 0;
  const avgHumidity = sensed.length ? sensed.reduce((s, r) => s + r.humidity, 0) / sensed.length : 0;
  // Okupansi hanya dari ruang kerja yang punya sensor kehadiran.
  const workspaces = rooms.filter((r) => isWorkspace(r) && r.occupancy != null);
  return {
    totalDevices: devices.length,
    online,
    offline: devices.length - online,
    byType,
    powerKw: powerW / 1000,
    avgTemp,
    avgHumidity,
    people: rooms.reduce((s, r) => s + (r.occupancy || 0), 0),
    capacity: rooms.reduce((s, r) => s + (r.capacity || 0), 0),
    occupiedRooms: workspaces.filter((r) => r.occupancy > 0).length,
    workspaceRooms: workspaces.length,
    rooms: rooms.length,
    equippedRooms: rooms.filter((r) => r.equipped).length,
  };
}

export function devicesInRoom(iot, roomId) {
  return iot.devices.filter((d) => d.roomId === roomId);
}

// Ruang kerja tanpa orang tetapi lampu/AC masih menyala.
export function findWasteRooms(iot) {
  const { floors } = indexIot(iot);
  const result = [];
  for (const floor of floors.values()) {
    for (const room of floor.rooms) {
      if (!isWorkspace(room) || room.occupancy !== 0) continue;
      const active = iot.devices.filter((d) => d.roomId === room.id && d.online && d.on && (d.type === 'light' || d.type === 'ac'));
      if (active.length) result.push({ floor, room, devices: active });
    }
  }
  return result;
}

export function summarizeParking(parking) {
  const zones = parking.zones.map((z) => {
    const occupied = z.slots.filter((s) => s.occupied).length;
    return { id: z.id, name: z.name, location: z.location, kind: z.kind, total: z.slots.length, occupied, free: z.slots.length - occupied };
  });
  const sum = (list, key) => list.reduce((s, z) => s + z[key], 0);
  const byKind = (kind) => {
    const list = zones.filter((z) => z.kind === kind);
    return { total: sum(list, 'total'), occupied: sum(list, 'occupied'), free: sum(list, 'free') };
  };
  const total = sum(zones, 'total');
  const occupied = sum(zones, 'occupied');
  return { zones, total, occupied, free: total - occupied, rate: total ? occupied / total : 0, car: byKind('car'), motorcycle: byKind('motorcycle') };
}

// severity: 'critical' | 'warning' | 'info'
export function getAlerts(iot, parking) {
  const alerts = [];
  const { rooms, floors } = indexIot(iot);
  const where = (d) => `${floors.get(d.floorId)?.name} · ${rooms.get(d.roomId)?.name}`;

  for (const d of iot.devices.filter((x) => !x.online)) {
    alerts.push({ id: `off-${d.id}`, severity: 'critical', title: `${DEVICE_TYPES[d.type].label} offline`, meta: `${where(d)} · ${d.id}`, href: `/iot.html?floor=${d.floorId}&room=${d.roomId}` });
  }
  for (const floor of floors.values()) {
    for (const room of floor.rooms) {
      if (room.temperature != null && room.temperature >= 29) {
        alerts.push({ id: `temp-${room.id}`, severity: 'critical', title: `Suhu tinggi ${fmt1(room.temperature)}°C`, meta: `${floor.name} · ${room.name}`, href: `/iot.html?floor=${floor.id}&room=${room.id}` });
      }
    }
  }
  for (const f of energyByFloor(iot, 'harian').floors.filter((x) => x.anomaly)) {
    alerts.push({ id: `energy-${f.floor.id}`, severity: 'warning', title: 'Pemakaian listrik di atas target', meta: `${f.floor.name} · ${fmt1(f.currentHour)} kWh jam ini, target ${fmt1(f.targetHour)} kWh`, href: `/iot.html?floor=${f.floor.id}#listrik` });
  }
  for (const w of findWasteRooms(iot)) {
    alerts.push({ id: `waste-${w.room.id}`, severity: 'warning', title: 'Ruang kosong, perangkat menyala', meta: `${w.floor.name} · ${w.room.name} · ${w.devices.length} perangkat`, href: `/iot.html?floor=${w.floor.id}&room=${w.room.id}` });
  }
  if (parking) {
    for (const z of summarizeParking(parking).zones) {
      if (z.free / z.total < 0.1) {
        alerts.push({ id: `park-${z.id}`, severity: 'warning', title: `${z.name} hampir penuh`, meta: `Sisa ${z.free} dari ${z.total} slot`, href: '/vision.html' });
      }
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ------------------------------------------------------------------ */
/* Listrik                                                             */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export const ENERGY_PERIODS = [
  { value: 'harian', label: 'Hari', current: 'Hari ini', previous: 'Kemarin' },
  { value: 'mingguan', label: 'Minggu', current: 'Minggu ini', previous: 'Minggu lalu' },
  { value: 'bulanan', label: 'Bulan', current: 'Bulan ini', previous: 'Bulan lalu' },
];

const sumOf = (list) => list.reduce((s, v) => s + (v ?? 0), 0);
// Jumlah sampai titik yang sama (jam/hari berjalan) supaya perbandingan adil.
const sumUntil = (list, n) => sumOf(list.slice(0, n));

function periodSeries(f, period) {
  if (period === 'mingguan') return { current: f.week, previous: f.lastWeek, target: null, labels: WEEKDAYS };
  if (period === 'bulanan') return { current: f.month, previous: f.lastMonth, target: null, labels: f.month.map((_, i) => String(i + 1)) };
  return { current: f.today, previous: f.yesterday, target: f.target, labels: f.today.map((_, i) => `${String(i).padStart(2, '0')}.00`) };
}

/**
 * Pemakaian listrik per lantai dan total gedung untuk satu periode.
 * `previousToDate` = periode lalu sampai titik yang sama, dasar persentase perubahan.
 */
export function energyByFloor(iot, period = 'harian') {
  const { energy } = iot;
  const floors = iot.building.floors.map((floor) => {
    const f = energy.floors[floor.id];
    const series = periodSeries(f, period);
    const filled = series.current.filter((v) => v != null).length;
    const kwh = sumOf(series.current);
    const previousToDate = sumUntil(series.previous, filled);
    const hour = new Date().getHours();
    const currentHour = f.today[hour] ?? 0;
    const minutes = new Date().getMinutes() / 60;
    const targetHour = f.target[hour] * Math.max(minutes, 0.25);
    return {
      floor,
      kwh,
      rupiah: kwh * energy.tariff,
      previous: sumOf(series.previous),
      previousToDate,
      change: previousToDate ? (kwh - previousToDate) / previousToDate : 0,
      currentHour,
      targetHour,
      anomaly: currentHour > targetHour * 1.2,
      series,
    };
  });
  const kwh = sumOf(floors.map((f) => f.kwh));
  const previousToDate = sumOf(floors.map((f) => f.previousToDate));
  for (const f of floors) f.share = kwh ? f.kwh / kwh : 0;
  return {
    period,
    tariff: energy.tariff,
    kwh,
    rupiah: kwh * energy.tariff,
    previous: sumOf(floors.map((f) => f.previous)),
    previousRupiah: sumOf(floors.map((f) => f.previous)) * energy.tariff,
    previousToDate,
    change: previousToDate ? (kwh - previousToDate) / previousToDate : 0,
    floors,
    updatedAt: energy.updatedAt,
  };
}

/** Seri grafik (sekarang, periode lalu, target) untuk gedung atau satu lantai. */
export function energySeries(iot, period = 'harian', floorId = null) {
  const { floors } = energyByFloor(iot, period);
  const list = floorId ? floors.filter((f) => f.floor.id === floorId) : floors;
  const { labels } = list[0].series;
  const add = (key) => {
    if (list.some((f) => !f.series[key])) return null;
    return labels.map((_, i) => (list.every((f) => f.series[key][i] == null) ? null : sumOf(list.map((f) => f.series[key][i]))));
  };
  // Titik terakhir (jam/hari berjalan) belum penuh dan akan terlihat anjlok: tidak digambar.
  const current = add('current');
  const last = current.findLastIndex((v) => v != null);
  if (last >= 0) current[last] = null;
  return { labels, current, previous: add('previous'), target: add('target') };
}

// Porsi ruang terhadap beban lantai, dari daya terpasang perangkatnya.
function roomShares(iot, floorId) {
  const watt = (d) => DEVICE_TYPES[d.type].watt;
  const floorW = iot.devices.filter((d) => d.floorId === floorId).reduce((s, d) => s + watt(d), 0);
  const peak = iot.energy.floors[floorId].peakKw * 1000;
  const shares = new Map();
  for (const d of iot.devices.filter((x) => x.floorId === floorId)) {
    shares.set(d.roomId, (shares.get(d.roomId) ?? 0) + (watt(d) * 0.7) / peak);
  }
  return { shares, floorW };
}

/** Pemakaian listrik satu ruang: hari ini, kemarin, dan seri per jam. */
export function roomEnergy(iot, roomId) {
  const { rooms } = indexIot(iot);
  const room = rooms.get(roomId);
  const f = iot.energy.floors[room.floorId];
  const share = roomShares(iot, room.floorId).shares.get(roomId) ?? 0;
  const scale = (list) => list.map((v) => (v == null ? null : v * share));
  const current = scale(f.today);
  const last = current.findLastIndex((v) => v != null);
  if (last >= 0) current[last] = null;
  const today = sumOf(f.today) * share;
  const yesterday = sumOf(f.yesterday) * share;
  return {
    today,
    yesterday,
    todayRupiah: today * iot.energy.tariff,
    yesterdayRupiah: yesterday * iot.energy.tariff,
    series: { labels: f.today.map((_, i) => `${String(i).padStart(2, '0')}.00`), current, previous: scale(f.yesterday), target: scale(f.target) },
  };
}

/** Ruang diurutkan dari pemakaian terbesar, untuk periode tertentu. */
export function roomRanking(iot, period = 'harian') {
  const totals = Object.fromEntries(energyByFloor(iot, period).floors.map((f) => [f.floor.id, f.kwh]));
  const result = [];
  for (const floor of iot.building.floors) {
    const { shares } = roomShares(iot, floor.id);
    for (const room of floor.rooms) {
      if (!shares.has(room.id) || room.type === 'corridor') continue;
      const kwh = totals[floor.id] * shares.get(room.id);
      result.push({ floor, room, kwh, rupiah: kwh * iot.energy.tariff });
    }
  }
  return result.sort((a, b) => b.kwh - a.kwh);
}

export function roomActivity(iot, roomId, limit = 20) {
  return iot.activity.filter((a) => a.roomId === roomId).slice(0, limit);
}
