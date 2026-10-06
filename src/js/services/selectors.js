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
  const sensed = rooms.filter((r) => r.type !== 'corridor' && r.type !== 'core');
  const avgTemp = sensed.length ? sensed.reduce((s, r) => s + r.temperature, 0) / sensed.length : 0;
  const avgHumidity = sensed.length ? sensed.reduce((s, r) => s + r.humidity, 0) / sensed.length : 0;
  const workspaces = rooms.filter(isWorkspace);
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
      if (!isWorkspace(room) || room.occupancy > 0) continue;
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
    alerts.push({ id: `off-${d.id}`, severity: 'critical', icon: 'wifi-off', title: `${DEVICE_TYPES[d.type].label} offline`, meta: `${where(d)} · ${d.id}`, href: `/iot.html?floor=${d.floorId}&room=${d.roomId}` });
  }
  for (const floor of floors.values()) {
    for (const room of floor.rooms) {
      const limit = room.type === 'server' ? 27 : 29;
      if (room.temperature >= limit) {
        alerts.push({ id: `temp-${room.id}`, severity: 'critical', icon: 'thermometer-sun', title: `Suhu tinggi ${fmt1(room.temperature)}°C`, meta: `${floor.name} · ${room.name}`, href: `/iot.html?floor=${floor.id}&room=${room.id}` });
      }
    }
  }
  for (const w of findWasteRooms(iot)) {
    alerts.push({ id: `waste-${w.room.id}`, severity: 'warning', icon: 'zap', title: 'Ruang kosong, perangkat menyala', meta: `${w.floor.name} · ${w.room.name} · ${w.devices.length} perangkat`, href: `/iot.html?floor=${w.floor.id}&room=${w.room.id}` });
  }
  if (parking) {
    for (const z of summarizeParking(parking).zones) {
      if (z.free / z.total < 0.1) {
        alerts.push({ id: `park-${z.id}`, severity: 'warning', icon: 'square-parking', title: `${z.name} hampir penuh`, meta: `Sisa ${z.free} dari ${z.total} slot`, href: '/vision.html' });
      }
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
