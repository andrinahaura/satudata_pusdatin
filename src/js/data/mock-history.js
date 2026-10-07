// Data historis perangkat IoT untuk mode simulasi: riwayat status (aktif / tidak aktif)
// dan riwayat konektivitas (terhubung / terputus). Bentuk objeknya = kontrak GET /iot/history.
//   statusLog: perubahan nilai status, terbaru di depan
//   outages  : selang waktu perangkat terputus; end = null berarti masih terputus
// Hari ini disimpan di state (berubah realtime). Hari-hari lalu dibuat ulang dari tanggalnya
// lewat statusForDay() dan outagesForDay(), jadi rentang waktu berapa pun bisa dilayani.
import { DEVICE_TYPES } from './device-types.js';
import { atHour, isWeekendKey, rngFor } from './mock-util.js';

const STATUS_LIMIT = 600;
const HOUR = 3600000;

const uid = (prefix, time) => `${prefix}-${time}-${Math.round(Math.random() * 1e6)}`;

function statusEntry(d, on, time, id = uid('ST', time.getTime())) {
  return { id, time: time.toISOString(), deviceId: d.id, floorId: d.floorId, roomId: d.roomId, type: d.type, on };
}

function outageEntry(d, start, end = null, auto = false, id = uid('OUT', start.getTime())) {
  return { id, deviceId: d.id, floorId: d.floorId, roomId: d.roomId, type: d.type, start: start.toISOString(), end: end?.toISOString() ?? null, auto };
}

/**
 * Perubahan status satu hari (jam kerja), terbaru di depan. Sensor suhu ikut dicatat:
 * aktif saat jam kerja, tidak aktif di luar jam kerja.
 * `until` = batas waktu (hari ini: sekarang).
 */
export function statusForDay(iot, key, until = null) {
  const rand = rngFor(`status:${key}`);
  const weekend = isWeekendKey(key);
  const log = [];
  for (const d of iot.devices) {
    if (d.type === 'sensor') {
      if (weekend) continue;
      log.push(statusEntry(d, true, atHour(key, 6.5 + rand() * 0.5), `ST-${key}-${d.id}-on`));
      log.push(statusEntry(d, false, atHour(key, 18 + rand()), `ST-${key}-${d.id}-off`));
      continue;
    }
    const n = weekend ? (rand() < 0.3 ? 2 : 0) : 2 + Math.floor(rand() * 3);
    const times = Array.from({ length: n }, () => 6.5 + rand() * 12).sort((a, b) => a - b);
    times.forEach((h, i) => log.push(statusEntry(d, i % 2 === 0, atHour(key, h), `ST-${key}-${d.id}-${i}`)));
  }
  return log.filter((e) => !until || new Date(e.time) <= until).sort((a, b) => b.time.localeCompare(a.time));
}

/** Gangguan koneksi yang dimulai pada hari itu (± 3 per hari). */
export function outagesForDay(iot, key, until = null) {
  const rand = rngFor(`outage:${key}`);
  const list = [];
  for (const d of iot.devices) {
    if (rand() > 0.02) continue;
    const start = atHour(key, rand() * 23);
    const end = new Date(start.getTime() + (5 + rand() * 175) * 60000);
    if (until && start > until) continue;
    list.push(outageEntry(d, start, until && end > until ? until : end, false, `OUT-${key}-${d.id}`));
  }
  return list.sort((a, b) => b.start.localeCompare(a.start));
}

export function createHistoryState(iot, now = new Date()) {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Hari ini: status sampai sekarang, gangguan yang sudah selesai, dan perangkat yang sedang offline.
  const statusLog = statusForDay(iot, key, now);
  const outages = [
    ...iot.devices.filter((d) => !d.online).map((d) => outageEntry(d, new Date(d.lastSeen))),
    ...outagesForDay(iot, key, now).filter((o) => new Date(o.end) < now),
  ];
  return { date: key, statusLog: statusLog.slice(0, STATUS_LIMIT), outages, updatedAt: now.toISOString() };
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
  // Yang disimpan hanya hari ini dan kemarin; hari lebih lama dibuat ulang oleh generator.
  const cutoff = now.getTime() - 48 * HOUR;
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
