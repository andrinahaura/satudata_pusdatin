// Fungsi turunan murni dari snapshot data. Dipakai halaman, komponen, dan chat engine.
import { MODELS, tokenCostRupiah } from '../data/chat-models.js';
import { DEVICE_TYPES, DEVICE_TYPE_KEYS, NON_WORKSPACE } from '../data/device-types.js';
import { fmt1 } from '../utils/format.js';
import { dayLabels, hourLabels } from '../utils/range.js';

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
// type    : 'offline' | 'temperature' | 'energy' | 'waste' | 'parking' (dipakai untuk mengelompokkan)
export function getAlerts(iot, parking) {
  const alerts = [];
  const { rooms, floors } = indexIot(iot);
  const where = (d) => `${floors.get(d.floorId)?.name} · ${rooms.get(d.roomId)?.name}`;

  for (const d of iot.devices.filter((x) => !x.online)) {
    alerts.push({ id: `off-${d.id}`, type: 'offline', severity: 'critical', title: `${DEVICE_TYPES[d.type].label} offline`, place: where(d), meta: where(d), href: `/iot.html?floor=${d.floorId}&room=${d.roomId}` });
  }
  for (const floor of floors.values()) {
    for (const room of floor.rooms) {
      if (room.temperature != null && room.temperature >= 29) {
        alerts.push({ id: `temp-${room.id}`, type: 'temperature', severity: 'critical', title: `Suhu tinggi ${fmt1(room.temperature)}°C`, place: `${floor.name} · ${room.name}`, meta: `${floor.name} · ${room.name}`, href: `/iot.html?floor=${floor.id}&room=${room.id}` });
      }
    }
  }
  for (const f of energyByFloor(iot, 'harian').floors.filter((x) => x.anomaly)) {
    alerts.push({ id: `energy-${f.floor.id}`, type: 'energy', severity: 'warning', title: 'Pemakaian listrik di atas target', place: f.floor.name, meta: `${f.floor.name} · ${fmt1(f.currentHour)} kWh jam ini, target ${fmt1(f.targetHour)} kWh`, href: `/iot.html?floor=${f.floor.id}#listrik` });
  }
  for (const w of findWasteRooms(iot)) {
    alerts.push({ id: `waste-${w.room.id}`, type: 'waste', severity: 'warning', title: 'Ruang kosong, perangkat menyala', place: `${w.floor.name} · ${w.room.name}`, meta: `${w.floor.name} · ${w.room.name} · ${w.devices.length} perangkat`, href: `/iot.html?floor=${w.floor.id}&room=${w.room.id}` });
  }
  if (parking) {
    for (const z of summarizeParking(parking).zones) {
      if (z.free / z.total < 0.1) {
        alerts.push({ id: `park-${z.id}`, type: 'parking', severity: 'warning', title: `${z.name} hampir penuh`, place: `${z.name} · ${z.location}`, meta: `Sisa ${z.free} dari ${z.total} slot`, href: '/vision.html' });
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

export function roomActivity(iot, roomId, limit = 20) {
  return iot.activity.filter((a) => a.roomId === roomId).slice(0, limit);
}

/**
 * Listrik untuk rentang waktu, dari GET /iot/energy (rentang + periode sebelumnya).
 * Satu hari: seri per jam (dengan target). Lebih dari satu hari: seri per hari.
 * Perbandingan dengan periode sebelumnya dihitung sampai titik yang sama (jam berjalan).
 */
export function energyRange(iot, hist, range) {
  const tariff = hist.tariff ?? iot.energy.tariff;
  const hours = (key, floorId) => hist.days[key]?.[floorId] ?? Array(24).fill(null);
  const floors = iot.building.floors.map((floor) => {
    const pairs = range.keys.map((k, i) => {
      const cur = hours(k, floor.id);
      const prev = hours(range.previous.keys[i], floor.id);
      const filled = cur.filter((v) => v != null).length;
      return { cur, prev, kwh: sumOf(cur), prevKwh: sumOf(prev), prevToDate: sumUntil(prev, filled) };
    });
    const kwh = sumOf(pairs.map((p) => p.kwh));
    const previousToDate = sumOf(pairs.map((p) => p.prevToDate));
    const series = range.single
      ? { current: pairs[0].cur, previous: pairs[0].prev, target: hist.target?.[floor.id] ?? null }
      : {
          current: pairs.map((p) => (p.cur.some((v) => v != null) ? p.kwh : null)),
          // Hari yang sedang berjalan dibandingkan sampai jam yang sama, supaya kedua garis turun bersama.
          previous: pairs.map((p, i) => (range.includesToday && i === pairs.length - 1 ? p.prevToDate : p.prevKwh)),
          target: null,
        };
    // Status target hanya bermakna untuk jam yang sedang berjalan (rentang hari ini).
    const today = range.preset === 'today' ? energyByFloor(iot, 'harian').floors.find((f) => f.floor.id === floor.id) : null;
    return {
      floor,
      kwh,
      rupiah: kwh * tariff,
      previousToDate,
      change: previousToDate ? (kwh - previousToDate) / previousToDate : 0,
      anomaly: today?.anomaly ?? false,
      currentHour: today?.currentHour ?? 0,
      targetHour: today?.targetHour ?? 0,
      series,
    };
  });
  const kwh = sumOf(floors.map((f) => f.kwh));
  const previousToDate = sumOf(floors.map((f) => f.previousToDate));
  for (const f of floors) f.share = kwh ? f.kwh / kwh : 0;
  const labels = range.single ? hourLabels() : dayLabels(range.keys);

  /** Seri gabungan gedung, atau satu lantai. Titik berjalan terakhir tidak digambar (belum penuh). */
  function seriesFor(floorId = null) {
    const list = floorId ? floors.filter((f) => f.floor.id === floorId) : floors;
    const add = (key) => {
      if (list.some((f) => !f.series[key])) return null;
      return labels.map((_, i) => (list.every((f) => f.series[key][i] == null) ? null : sumOf(list.map((f) => f.series[key][i]))));
    };
    const current = add('current');
    if (range.includesToday) {
      const last = current.findLastIndex((v) => v != null);
      if (last >= 0 && range.single) current[last] = null;
    }
    return { labels, current, previous: add('previous'), target: add('target') };
  }

  return {
    tariff,
    kwh,
    rupiah: kwh * tariff,
    previousToDate,
    previousRupiah: previousToDate * tariff,
    change: previousToDate ? (kwh - previousToDate) / previousToDate : 0,
    floors,
    totals: Object.fromEntries(floors.map((f) => [f.floor.id, f.kwh])),
    seriesFor,
  };
}

/* ------------------------------------------------------------------ */
/* Riwayat perangkat                                                   */
/* ------------------------------------------------------------------ */

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

const overlap = (start, end, from, to) => Math.max(0, Math.min(end, to) - Math.max(start, from));

/**
 * Uptime perangkat di rentang waktu (sampai sekarang bila rentang memuat hari ini).
 * buckets: per jam untuk satu hari, per hari untuk rentang lebih panjang.
 * buckets[i].ratio = porsi waktu perangkat terhubung (null untuk jam yang belum lewat).
 */
export function deviceUptime(history, iot, range) {
  const from = range.from.getTime();
  const to = Math.min(range.to.getTime(), Date.now());
  const outages = history.outages.map((o) => ({ ...o, s: new Date(o.start).getTime(), e: o.end ? new Date(o.end).getTime() : Date.now() }));
  const inWindow = outages.filter((o) => o.e > from && o.s < to);

  const perDevice = new Map(iot.devices.map((d) => [d.id, { device: d, downMs: 0, outages: 0, last: null }]));
  for (const o of inWindow) {
    const row = perDevice.get(o.deviceId);
    if (!row) continue;
    row.downMs += overlap(o.s, o.e, from, to);
    row.outages += 1;
    if (!row.last || o.s > new Date(row.last.start).getTime()) row.last = o;
  }
  const span = Math.max(1, to - from);
  for (const row of perDevice.values()) row.uptime = 1 - row.downMs / span;

  const size = range.single ? HOUR_MS : DAY_MS;
  const count = range.single ? 24 : range.keys.length;
  const labels = range.single ? hourLabels() : dayLabels(range.keys);
  const buckets = Array.from({ length: count }, (_, i) => {
    const s = from + i * size;
    const e = Math.min(s + size, to);
    if (e <= s) return { label: labels[i], ratio: null, outages: 0 };
    const down = inWindow.reduce((sum, o) => sum + overlap(o.s, o.e, s, e), 0);
    return { label: labels[i], ratio: 1 - down / (iot.devices.length * (e - s)), outages: inWindow.filter((o) => o.s >= s && o.s < e).length };
  });

  const downMs = [...perDevice.values()].reduce((sum, r) => sum + r.downMs, 0);
  return {
    overall: 1 - downMs / (iot.devices.length * span),
    outages: inWindow.length,
    downMs,
    disconnected: iot.devices.filter((d) => !d.online).length,
    buckets,
    devices: [...perDevice.values()].sort((a, b) => a.uptime - b.uptime || b.outages - a.outages),
  };
}

/* ------------------------------------------------------------------ */
/* Parkir                                                              */
/* ------------------------------------------------------------------ */

export function summarizeVisits(parking, now = new Date()) {
  const visits = parking.visits ?? [];
  const inside = visits.filter((v) => !v.outAt);
  const done = visits.filter((v) => v.outAt);
  const minutes = (v) => ((v.outAt ? new Date(v.outAt) : now) - new Date(v.inAt)) / 60000;
  const avg = (list) => (list.length ? list.reduce((s, v) => s + minutes(v), 0) / list.length : 0);
  return { total: visits.length, inside: inside.length, done: done.length, avgDoneMinutes: avg(done), avgInsideMinutes: avg(inside), minutes };
}

/** Lama parkir satu kunjungan dalam menit (sampai sekarang bila belum keluar). */
export const visitMinutes = (v, now = new Date()) => ((v.outAt ? new Date(v.outAt) : now) - new Date(v.inAt)) / 60000;

/**
 * Statistik parkir di rentang, dari GET /parking/stats.
 * Satu hari: okupansi per jam. Lebih dari satu hari: puncak dan rata-rata okupansi per hari.
 */
export function parkingRange(stats, range) {
  const days = stats.days;
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const sumType = (key) => days.reduce((acc, d) => {
    for (const [k, v] of Object.entries(d[key])) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
  const inBy = sumType('in');
  const outBy = sumType('out');
  const outCount = total(outBy);
  const avgDurationMin = outCount ? days.reduce((s, d) => s + d.avgDurationMin * total(d.out), 0) / outCount : 0;
  const values = (d) => d.hourly.map((h) => h.occupancy).filter((v) => v != null);
  const daily = days.map((d) => {
    const v = values(d);
    return v.length ? { peak: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length } : { peak: null, avg: null };
  });
  const series = range.single
    ? { labels: (days[0]?.hourly ?? []).map((h) => h.hour.slice(0, 2)), main: (days[0]?.hourly ?? []).map((h) => (h.occupancy == null ? null : Math.round(h.occupancy * 100))), second: null }
    : { labels: dayLabels(range.keys), main: daily.map((d) => (d.peak == null ? null : Math.round(d.peak * 100))), second: daily.map((d) => (d.avg == null ? null : Math.round(d.avg * 100))) };
  const peaks = daily.map((d) => d.peak).filter((v) => v != null);
  return { in: total(inBy), out: outCount, inBy, outBy, avgDurationMin, peak: peaks.length ? Math.max(...peaks) : 0, series };
}

/* ------------------------------------------------------------------ */
/* Chatbot                                                             */
/* ------------------------------------------------------------------ */

const costOf = (byModel) => Object.entries(byModel).reduce((s, [m, v]) => s + tokenCostRupiah(m, v.inputTokens, v.outputTokens), 0);

/**
 * Ringkasan analitik chatbot dari GET /chat/analytics untuk satu rentang.
 * Satu hari: seri per jam. Lebih dari satu hari: seri per hari.
 */
export function summarizeChat(chat, range) {
  const { days } = chat;
  const sum = (key) => days.reduce((s, d) => s + d[key], 0);

  // Per pengguna di rentang: jumlah pertanyaan dan ulasan.
  const perUser = new Map();
  for (const d of days) {
    for (const [id, u] of Object.entries(d.users)) {
      const row = perUser.get(id) ?? { questions: 0, up: 0, down: 0 };
      row.questions += u.questions;
      row.up += u.up;
      row.down += u.down;
      perUser.set(id, row);
    }
  }
  const users = chat.users
    .filter((u) => perUser.get(u.id)?.questions)
    .map((u) => ({ ...u, ...perUser.get(u.id) }))
    .sort((a, b) => (b.lastLogin ?? '').localeCompare(a.lastLogin ?? ''));
  const ratings = users.reduce((acc, u) => ({ up: acc.up + u.up, down: acc.down + u.down }), { up: 0, down: 0 });
  const rated = ratings.up + ratings.down;

  const byModel = MODELS.map((model) => {
    const t = days.reduce((acc, d) => {
      const v = d.byModel[model] ?? { questions: 0, inputTokens: 0, outputTokens: 0 };
      return { questions: acc.questions + v.questions, inputTokens: acc.inputTokens + v.inputTokens, outputTokens: acc.outputTokens + v.outputTokens };
    }, { questions: 0, inputTokens: 0, outputTokens: 0 });
    return { model, ...t, tokens: t.inputTokens + t.outputTokens, rupiah: tokenCostRupiah(model, t.inputTokens, t.outputTokens) };
  });

  const nowHour = new Date().getHours();
  const buckets = range.single
    ? (days[0]?.hours ?? []).map((h, i) => (range.includesToday && i > nowHour ? null : h))
    : days;
  const pick = (fn) => buckets.map((b) => (b == null ? null : fn(b)));
  const tokens = sum('inputTokens') + sum('outputTokens');
  return {
    users: users.length,
    userRows: users,
    questions: sum('questions'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    tokens,
    rupiah: days.reduce((s, d) => s + costOf(d.byModel), 0),
    ratings,
    rated,
    upRate: rated ? ratings.up / rated : 0,
    byModel,
    series: {
      labels: range.single ? hourLabels() : dayLabels(range.keys),
      questions: pick((b) => b.questions),
      activeUsers: range.single ? null : days.map((d) => Object.values(d.users).filter((u) => u.questions).length),
      tokens: pick((b) => b.inputTokens + b.outputTokens),
      rupiah: pick((b) => costOf(b.byModel)),
    },
  };
}
