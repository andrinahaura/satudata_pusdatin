// Data historis perangkat IoT untuk mode simulasi: riwayat status (aktif / tidak aktif)
// dan riwayat konektivitas (terhubung / terputus). Bentuk objeknya = kontrak GET /iot/history.
//   statusLog: perubahan nilai status, terbaru di depan
//   outages  : selang waktu perangkat terputus; end = null berarti masih terputus
import { DEVICE_TYPES } from './device-types.js';

const STATUS_LIMIT = 600;
const OUTAGE_DAYS = 7;
const HOUR = 3600000;

function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const uid = (prefix, time) => `${prefix}-${time}-${Math.round(Math.random() * 1e6)}`;

function statusEntry(d, on, time) {
  return { id: uid('ST', time.getTime()), time: time.toISOString(), deviceId: d.id, floorId: d.floorId, roomId: d.roomId, type: d.type, on };
}

function outageEntry(d, start, end = null, auto = false) {
  return { id: uid('OUT', start.getTime()), deviceId: d.id, floorId: d.floorId, roomId: d.roomId, type: d.type, start: start.toISOString(), end: end?.toISOString() ?? null, auto };
}

export function createHistoryState(iot, now = new Date(), seed = 9071) {
  const rand = createRng(seed);
  const statusLog = [];
  const dayStart = new Date(now);
  dayStart.setHours(6, 30, 0, 0);
  const span = Math.max(0, now - dayStart);

  // Status hari ini: 1–3 perubahan per perangkat, perubahan terakhir sama dengan status sekarang.
  for (const d of iot.devices) {
    if (d.type === 'sensor' || !span) continue;
    const n = 1 + Math.floor(rand() * 3);
    const times = Array.from({ length: n }, () => new Date(dayStart.getTime() + rand() * span)).sort((a, b) => a - b);
    let on = n % 2 === 1 ? d.on : !d.on;
    for (const t of times) {
      statusLog.push(statusEntry(d, on, t));
      on = !on;
    }
  }
  statusLog.sort((a, b) => b.time.localeCompare(a.time));

  // Gangguan koneksi 7 hari terakhir pada sebagian kecil perangkat.
  const outages = [];
  const from = now.getTime() - OUTAGE_DAYS * 24 * HOUR;
  for (const d of iot.devices) {
    if (!d.online) {
      outages.push(outageEntry(d, new Date(d.lastSeen)));
      continue;
    }
    if (rand() > 0.14) continue;
    const n = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const start = from + rand() * (OUTAGE_DAYS * 24 - 2) * HOUR;
      const minutes = 5 + Math.floor(rand() * 175);
      outages.push(outageEntry(d, new Date(start), new Date(start + minutes * 60000)));
    }
  }
  outages.sort((a, b) => b.start.localeCompare(a.start));

  return { statusLog: statusLog.slice(0, STATUS_LIMIT), outages, windowDays: OUTAGE_DAYS, updatedAt: now.toISOString() };
}

/** Status setiap perangkat sebelum ada perubahan, untuk dibandingkan dengan recordChanges(). */
export function snapshotDevices(iot) {
  return new Map(iot.devices.map((d) => [d.id, { on: d.on, online: d.online }]));
}

/** Catat perubahan status dan koneksi sejak snapshot `before`. */
export function recordChanges(history, iot, before, now = new Date()) {
  for (const d of iot.devices) {
    const prev = before.get(d.id);
    if (!prev) continue;
    if (prev.online && !d.online) history.outages.unshift(outageEntry(d, now, null, d.simOffline === true));
    if (!prev.online && d.online) {
      const open = history.outages.find((o) => o.deviceId === d.id && !o.end);
      if (open) open.end = now.toISOString();
    }
    if (d.online && prev.on !== d.on && d.type !== 'sensor') history.statusLog.unshift(statusEntry(d, d.on, now));
  }
  history.statusLog.length = Math.min(history.statusLog.length, STATUS_LIMIT);
  // Gangguan yang sudah selesai dan lebih tua dari jendela riwayat dibuang.
  const cutoff = now.getTime() - (OUTAGE_DAYS + 1) * 24 * HOUR;
  history.outages = history.outages.filter((o) => !o.end || new Date(o.end).getTime() > cutoff);
  history.updatedAt = now.toISOString();
}

/**
 * Simulasi koneksi: sesekali satu perangkat terputus, lalu tersambung lagi beberapa saat kemudian.
 * Perangkat yang offline sejak awal skenario demo tidak ikut dipulihkan.
 */
export function simulateConnectivity(iot, rand = Math.random) {
  const simulated = iot.devices.filter((d) => d.simOffline);
  for (const d of simulated) {
    if (rand() < 0.22) {
      d.online = true;
      delete d.simOffline;
    }
  }
  if (simulated.length < 2 && rand() < 0.035) {
    const candidates = iot.devices.filter((d) => d.online);
    const d = candidates[Math.floor(rand() * candidates.length)];
    if (d) {
      d.online = false;
      d.simOffline = true;
      if (DEVICE_TYPES[d.type].controllable) d.on = false;
    }
  }
}
