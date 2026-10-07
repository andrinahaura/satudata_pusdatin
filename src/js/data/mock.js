// Generator data simulasi. Bentuk objek yang dihasilkan di sini = kontrak data
// yang diharapkan dari backend (lihat README "Kontrak API").
// Gedung, ruang, dan jenis perangkat mengikuti kondisi Gedung Pusdatin di Sinatra
// (BGC untuk ruang & perangkat, ICC untuk meter listrik); angkanya simulasi.
import { DEVICE_TYPES, NON_WORKSPACE } from './device-types.js';
import { rngFor } from './mock-util.js';

// PRNG deterministik supaya denah & status sama di setiap halaman/reload.
function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* ------------------------------------------------------------------ */
/* Denah gedung                                                        */
/* ------------------------------------------------------------------ */

// Koordinat denah memakai viewBox 1000 x 560. Dinding luar 20..980 x 20..540,
// koridor tengah y 250..310. Setiap baris lebar totalnya 960.
const ROW_TOP = { y: 20, h: 230 };
const CORRIDOR = { y: 250, h: 60 };
const ROW_BOTTOM = { y: 310, h: 230 };

// [nama, lebar, tipe, sensor terpasang?]. Ruang tanpa sensor tampil "Sensor belum terpasang".
const FLOORS = [
  {
    id: 'B',
    level: 0,
    name: 'Basement',
    short: 'B',
    label: 'Ruang tim, gym & gudang',
    top: [['07 R. Presentasi', 200, 'meeting', false], ['08 R. Katim', 200, 'office'], ['09 R. Tim Jaringan', 220, 'office'], ['R. Operator Band', 140, 'office', false], ['Band Room', 200, 'hall', false]],
    corridor: [['Foyer', 960]],
    bottom: [['Workspace Basement', 340, 'office'], ['05 R. Cipta Karya', 160, 'office', false], ['04 GYM Area', 180, 'hall'], ['03 R. Katim', 100, 'office'], ['02 R. Katim', 100, 'office'], ['Gudang', 80, 'storage', false]],
  },
  {
    id: 'L1',
    level: 1,
    name: 'Lantai 1',
    short: 'Lt 1',
    label: 'Ruang Katim, rapat & layanan',
    top: [
      ['20 R. Jafung Madya', 110, 'office'], ['21 R. Katim', 80, 'office'], ['22 R. Katim', 80, 'office'], ['23 R. Katim', 80, 'office'],
      ['24 R. Katim', 80, 'office'], ['25 R. Katim', 80, 'office'], ['26 R. Katim', 80, 'office'], ['27 R. Katim', 80, 'office'],
      ['28 R. Tim Keamanan', 100, 'office', false], ['Ruang Makan', 100, 'pantry'], ['Sekretariat DWP Sekjen', 90, 'office', false],
    ],
    corridor: [['Koridor Barat', 480], ['Koridor Timur depan', 480, false]],
    bottom: [
      ['18 R. Rapat', 100, 'meeting'], ['19 R. Rapat', 90, 'meeting', false], ['17 R. Kabid MTI', 80, 'office'], ['16 R. Kabid DI', 80, 'office'],
      ['R. Tunggu Kabid', 60, 'lobby', false], ['R. Staff Area', 120, 'office'], ['Lobby', 110, 'lobby'], ['R. Laktasi', 50, 'office'],
      ['Mushola', 70, 'hall'], ['Wudhu Pria', 40, 'toilet'], ['Wudhu Wanita', 40, 'toilet', false], ['Toilet Wanita', 40, 'toilet', false],
      ['Toilet Pria', 40, 'toilet', false], ['Bordes', 40, 'core', false],
    ],
  },
  {
    id: 'L2',
    level: 2,
    name: 'Lantai 2',
    short: 'Lt 2',
    label: 'Pimpinan & sekretariat',
    top: [
      ['Workspace Lt 2', 300, 'office'], ['37 R. Katim', 90, 'office'], ['38 R. Katim', 90, 'office'], ['39 R. Katim', 90, 'office', false],
      ['40 R. Katim', 90, 'office', false], ['41 R. Kasubag TU', 100, 'office', false], ['Area Sekretaris', 100, 'office'], ['R. Bendahara', 100, 'office', false],
    ],
    corridor: [['Koridor', 480, false], ['Koridor 2', 480]],
    bottom: [['R. Kepala Pusat', 300, 'office', false], ['Foyer', 180, 'lobby', false], ['R. File', 160, 'storage', false], ['Toilet Wanita', 100, 'toilet', false], ['Toilet Pria', 100, 'toilet', false], ['Janitor', 120, 'storage', false]],
  },
];

function layoutRow(specs, { y, h }, floorId, startIndex, type = null) {
  let x = 20;
  return specs.map((spec, i) => {
    const [name, w] = spec;
    const room = { id: `${floorId}-R${pad2(startIndex + i + 1)}`, floorId, name, type: type ?? spec[2], equipped: (type ? spec[2] : spec[3]) !== false, x, y, w, h };
    x += w;
    return room;
  });
}

function lightPositions(room, n) {
  if (room.type === 'corridor') {
    return Array.from({ length: n }, (_, i) => ({ x: Math.round(room.x + ((i + 0.5) * room.w) / n), y: room.y + room.h / 2 }));
  }
  const padX = Math.min(34, room.w * 0.25);
  const top = 58;
  const bottom = 64;
  const iw = room.w - padX * 2;
  const ih = room.h - top - bottom;
  const cols = Math.max(1, Math.round(Math.sqrt((n * iw) / ih)));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(room.x + padX + ((i % cols) + 0.5) * (iw / cols)),
    y: Math.round(room.y + top + (Math.floor(i / cols) + 0.5) * (ih / rows)),
  }));
}

function makeDevice(room, type, index, pos, props) {
  const code = { light: 'LMP', ac: 'AC', sensor: 'IR', presence: 'HPS' }[type];
  return {
    id: `${room.id}-${code}${index}`,
    type,
    name: `${DEVICE_TYPES[type].label} ${index}`,
    floorId: room.floorId,
    roomId: room.id,
    x: pos.x,
    y: pos.y,
    on: true,
    online: true,
    lastSeen: new Date().toISOString(),
    ...props,
  };
}

const COOLED = new Set(['office', 'meeting', 'hall', 'lobby', 'pantry']);

function addRoomDevices(room, rand, devices) {
  if (!room.equipped) return;
  const occupied = room.occupancy > 0;
  const inset = Math.min(22, room.w / 4);

  // Saklar lampu
  const n = room.type === 'corridor' ? Math.round(room.w / 120) : Math.max(1, Math.min(4, Math.round((room.w * room.h) / 14000)));
  const pOn = room.type === 'corridor' ? 0.85 : occupied ? 0.92 : 0.22;
  lightPositions(room, n).forEach((pos, i) => devices.push(makeDevice(room, 'light', i + 1, pos, { on: rand() < pOn })));

  // Sensor kehadiran (HPS): menyala = ada orang.
  const presencePos = room.type === 'corridor' ? { x: room.x + 30, y: room.y + 16 } : { x: room.x + room.w - inset, y: room.y + room.h - 50 };
  devices.push(makeDevice(room, 'presence', 1, presencePos, { on: occupied }));

  if (!COOLED.has(room.type)) return;

  // Remote IR + sensor suhu & kelembaban
  devices.push(makeDevice(room, 'sensor', 1, { x: room.x + inset, y: room.y + room.h - 22 }));

  // AC
  const nAc = room.w >= 200 ? 2 : 1;
  const pAc = occupied ? 0.88 : 0.25;
  for (let i = 0; i < nAc; i++) {
    const pos = { x: room.x + room.w - 24 - i * 30, y: room.y + room.h - 22 };
    devices.push(makeDevice(room, 'ac', i + 1, pos, { on: rand() < pAc, setpoint: 24 }));
  }
}

/* ------------------------------------------------------------------ */
/* Listrik (meter per lantai, seperti Sinatra ICC)                     */
/* ------------------------------------------------------------------ */

export const TARIFF = 1727; // Rp per kWh

// Fraksi beban puncak per jam pada hari kerja.
const LOAD_CURVE = [0.16, 0.15, 0.15, 0.15, 0.16, 0.2, 0.34, 0.6, 0.88, 1, 1, 0.97, 0.84, 0.94, 1, 0.96, 0.86, 0.58, 0.36, 0.28, 0.24, 0.2, 0.18, 0.17];
const WEEKEND = 0.32;
// Beban di luar perangkat IoT (stop kontak, server, pompa) per lantai, kW.
const BASE_KW = { B: 0.4, L1: 4.5, L2: 2.2 };
const FAN_KW = 0.3;

// Meter di panel distribusi: trafo induk mengalir ke output tiap lantai dan panel kipas.
const PANELS = [
  { id: 'TRAFO', name: 'Trafo induk', meter: 'PU 6 · Kelistrikan 1', source: true },
  { id: 'OUT-L2', name: 'Output Lantai 2', meter: 'PU 2 · Kelistrikan 1', floorId: 'L2' },
  { id: 'OUT-L1', name: 'Output Lantai 1', meter: 'PU 3 · Kelistrikan 1', floorId: 'L1' },
  { id: 'OUT-B', name: 'Output Basement', meter: 'PU 4 · Kelistrikan 1', floorId: 'B' },
  { id: 'OUT-FAN', name: 'Output Panel Kipas', meter: 'PU 6 · Kelistrikan 2', fan: true },
];

function peakKw(floorId, devices) {
  const deviceW = devices.filter((d) => d.floorId === floorId).reduce((s, d) => s + DEVICE_TYPES[d.type].watt, 0);
  return (deviceW * 0.7) / 1000 + BASE_KW[floorId];
}

const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function hourly(peak, date, rand, untilHour = 24, partial = 1) {
  const factor = isWeekend(date) ? WEEKEND : 1;
  return LOAD_CURVE.map((f, h) => {
    if (h > untilHour) return null;
    const v = f * peak * factor * (0.9 + rand() * 0.2);
    return round2(h === untilHour ? v * partial : v);
  });
}

function sumSeries(list) {
  return list.reduce((s, v) => s + (v ?? 0), 0);
}

/** Pemakaian per jam satu lantai pada hari yang sudah lewat (deterministik dari tanggal). */
export function energyDayHourly(floorId, peak, key) {
  const rand = rngFor(`energy:${floorId}:${key}`);
  peak = round2(peak); // sama dengan peakKw yang disimpan, supaya hasil di state dan di riwayat identik
  const date = new Date(`${key}T00:00:00`);
  const level = 0.92 + rand() * 0.16;
  return hourly(peak * level, date, rand);
}

const dayTotal = (floorId, peak, date) => round1(sumSeries(energyDayHourly(floorId, peak, localDate(date))));

export function createEnergyState(devices, now = new Date(), seed = 4410) {
  const rand = createRng(seed + now.getDate());
  // Hari ini acak dari seed; hari-hari lalu dari energyDayHourly() supaya sama dengan riwayat rentang waktu.
  const h = now.getHours();
  const partial = now.getMinutes() / 60;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const weekday = (now.getDay() + 6) % 7; // Senin = 0
  const y = now.getFullYear();
  const m = now.getMonth();

  const floors = {};
  for (const def of FLOORS) {
    const peak = peakKw(def.id, devices);
    const today = hourly(peak, now, rand, h, partial);
    const week = Array.from({ length: 7 }, (_, i) => {
      if (i > weekday) return null;
      const d = new Date(now);
      d.setDate(now.getDate() - weekday + i);
      return i === weekday ? null : dayTotal(def.id, peak, d);
    });
    const lastWeek = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - weekday - 7 + i);
      return dayTotal(def.id, peak, d);
    });
    const month = Array.from({ length: daysInMonth(y, m) }, (_, i) => (i + 1 >= now.getDate() ? null : dayTotal(def.id, peak, new Date(y, m, i + 1))));
    const lastMonth = Array.from({ length: daysInMonth(y, m - 1) }, (_, i) => dayTotal(def.id, peak, new Date(y, m - 1, i + 1)));
    floors[def.id] = {
      peakKw: round2(peak),
      today,
      yesterday: energyDayHourly(def.id, peak, localDate(yesterday)),
      target: LOAD_CURVE.map((f) => round2(f * peak * 0.95)),
      week,
      lastWeek,
      month,
      lastMonth,
    };
    syncTotals(floors[def.id], now);
  }

  // Skenario demo: AC Workspace Lt 2 dibiarkan menyala, beban jam berjalan di atas target.
  const l2 = floors.L2;
  if (l2.today[h] != null) l2.today[h] = round2(l2.target[h] * 1.32 * Math.max(partial, 0.25));
  syncTotals(l2, now);

  const fanToday = round2(LOAD_CURVE.slice(0, h + 1).reduce((s, f) => s + f, 0) * FAN_KW);
  const panels = PANELS.map((p) => ({ ...p, voltage: 0, current: 0, pf: 0, kw: 0, kwhToday: p.fan ? fanToday : 0, online: true }));

  return { tariff: TARIFF, date: localDate(now), floors, panels, updatedAt: now.toISOString() };
}

// Total hari ini ikut masuk ke seri mingguan & bulanan.
function syncTotals(floor, now) {
  const total = round1(sumSeries(floor.today));
  floor.week[(now.getDay() + 6) % 7] = total;
  floor.month[now.getDate() - 1] = total;
}

function stepEnergy(energy, iot, dtSec, rand) {
  const now = new Date();
  if (energy.date !== localDate(now)) {
    Object.assign(energy, createEnergyState(iot.devices, now));
    return;
  }
  const h = now.getHours();
  const factor = isWeekend(now) ? WEEKEND : 1;
  let totalKw = 0;
  for (const panel of energy.panels) {
    if (panel.source) continue;
    let kw;
    if (panel.fan) {
      kw = FAN_KW * LOAD_CURVE[h];
      panel.kwhToday = round2(panel.kwhToday + (kw * dtSec) / 3600);
    } else {
      const deviceW = iot.devices.filter((d) => d.floorId === panel.floorId && d.on && d.online).reduce((s, d) => s + DEVICE_TYPES[d.type].watt, 0);
      kw = deviceW / 1000 + BASE_KW[panel.floorId] * LOAD_CURVE[h] * factor;
      const floor = energy.floors[panel.floorId];
      floor.today[h] = round2((floor.today[h] ?? 0) + (kw * dtSec) / 3600);
      syncTotals(floor, now);
      panel.kwhToday = round2(sumSeries(floor.today));
    }
    readMeter(panel, kw, rand);
    totalKw += kw;
  }
  const trafo = energy.panels.find((p) => p.source);
  trafo.kwhToday = round2(energy.panels.filter((p) => !p.source).reduce((s, p) => s + p.kwhToday, 0));
  readMeter(trafo, totalKw, rand);
  energy.updatedAt = now.toISOString();
}

// Tegangan, arus, dan faktor daya 3 fasa dari beban kW.
function readMeter(panel, kw, rand) {
  panel.voltage = round1(404 + (rand() - 0.5) * 8);
  panel.pf = round2(0.86 + rand() * 0.08);
  panel.kw = round2(kw);
  panel.current = round1((kw * 1000) / (Math.sqrt(3) * panel.voltage * panel.pf));
}

/* ------------------------------------------------------------------ */
/* Riwayat aktivitas per ruang                                         */
/* ------------------------------------------------------------------ */

const ACTIVITY_LIMIT = 300;

export function logActivity(iot, roomId, text, time = new Date()) {
  const room = iot.building.floors.flatMap((f) => f.rooms).find((r) => r.id === roomId);
  if (!room) return;
  iot.activity.unshift({ id: `ACT-${time.getTime()}-${Math.round(Math.random() * 1e6)}`, time: time.toISOString(), roomId, floorId: room.floorId, text });
  iot.activity.length = Math.min(iot.activity.length, ACTIVITY_LIMIT);
}

function seedActivity(iot, rand, now) {
  const events = [];
  const at = (hour, minute) => {
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    return d <= now ? d : null;
  };
  for (const room of iot.building.floors.flatMap((f) => f.rooms)) {
    if (!room.equipped || room.type === 'corridor') continue;
    const arrive = at(7, Math.floor(rand() * 59));
    const lightOn = at(7 + Math.floor(rand() * 2), Math.floor(rand() * 59));
    const acOn = at(8, Math.floor(rand() * 59));
    const lunch = at(12, Math.floor(rand() * 30));
    const back = at(13, Math.floor(rand() * 30));
    const ac = iot.devices.some((d) => d.roomId === room.id && d.type === 'ac');
    if (arrive) events.push({ time: arrive, room, text: 'Orang terdeteksi' });
    if (lightOn) events.push({ time: lightOn, room, text: 'Lampu 1 dinyalakan' });
    if (ac && acOn) events.push({ time: acOn, room, text: 'AC 1 dinyalakan, setpoint 24°C' });
    if (lunch) events.push({ time: lunch, room, text: 'Tidak ada orang' });
    if (back) events.push({ time: back, room, text: 'Orang terdeteksi' });
  }
  events.sort((a, b) => b.time - a.time);
  iot.activity = events.slice(0, ACTIVITY_LIMIT).map((e, i) => ({ id: `ACT-${i}`, time: e.time.toISOString(), roomId: e.room.id, floorId: e.room.floorId, text: e.text }));
}

/* ------------------------------------------------------------------ */
/* State IoT                                                           */
/* ------------------------------------------------------------------ */

export function createIotState(seed = 20261005) {
  const rand = createRng(seed);
  const floors = [];
  const devices = [];

  for (const def of FLOORS) {
    const top = layoutRow(def.top, ROW_TOP, def.id, 0);
    const corridor = layoutRow(def.corridor, CORRIDOR, def.id, top.length, 'corridor');
    const bottom = layoutRow(def.bottom, ROW_BOTTOM, def.id, top.length + corridor.length);
    const rooms = [...top, ...corridor, ...bottom];

    for (const room of rooms) {
      const workspace = !NON_WORKSPACE.has(room.type);
      room.capacity = workspace ? Math.max(2, Math.round((room.w * room.h) / 7000)) : 0;
      // Tanpa sensor kehadiran, jumlah orang tidak diketahui (null).
      room.occupancy = !room.equipped ? null : !workspace ? 0 : rand() < 0.3 ? 0 : 1 + Math.floor(rand() * room.capacity);
      if (room.equipped && room.type === 'corridor') room.occupancy = rand() < 0.6 ? 1 : 0;
      addRoomDevices(room, rand, devices);
    }

    floors.push({ id: def.id, level: def.level, name: def.name, short: def.short, label: def.label, rooms });
  }

  // Suhu & kelembaban hanya ada di ruang dengan sensor suhu (remote IR).
  for (const room of floors.flatMap((f) => f.rooms)) {
    const sensor = devices.some((d) => d.roomId === room.id && d.type === 'sensor');
    const acOn = devices.some((d) => d.roomId === room.id && d.type === 'ac' && d.on);
    room.temperature = sensor ? round1((acOn ? 23.5 : 27) + rand() * 1.8) : null;
    room.humidity = sensor ? Math.round(50 + rand() * 15) : null;
  }

  // Skenario demo: beberapa perangkat offline, Workspace Lt 2 kosong tapi AC menyala.
  const room = (floorId, name) => floors.find((f) => f.id === floorId).rooms.find((r) => r.name === name);
  const pick = (pred) => devices.find(pred);
  for (const d of [
    pick((d) => d.floorId === 'L1' && d.type === 'light' && d.roomId === room('L1', '22 R. Katim').id),
    pick((d) => d.type === 'ac' && d.roomId === room('B', '09 R. Tim Jaringan').id),
    pick((d) => d.type === 'presence' && d.roomId === room('L1', 'Mushola').id),
  ]) {
    if (d) Object.assign(d, { online: false, on: false, lastSeen: new Date(Date.now() - 42 * 60000).toISOString() });
  }
  const jaringan = room('B', '09 R. Tim Jaringan');
  jaringan.temperature = 29.4;
  const wsL2 = room('L2', 'Workspace Lt 2');
  wsL2.occupancy = 0;
  for (const d of devices.filter((x) => x.roomId === wsL2.id)) d.on = d.type !== 'presence';

  const iot = {
    building: { id: 'pusdatin', name: 'Gedung Pusdatin', floors },
    devices,
    activity: [],
    energy: null,
    updatedAt: new Date().toISOString(),
  };
  const now = new Date();
  iot.energy = createEnergyState(devices, now);
  seedActivity(iot, rand, now);
  stepEnergy(iot.energy, iot, 0, rand);
  return iot;
}

// Simulasi perubahan realtime (dipanggil tiap interval oleh mock backend).
export function stepIot(state, rand = Math.random, dtSec = 5) {
  const acOnByRoom = new Set(state.devices.filter((d) => d.type === 'ac' && d.on && d.online).map((d) => d.roomId));
  for (const floor of state.building.floors) {
    for (const room of floor.rooms) {
      if (room.temperature != null) {
        const target = acOnByRoom.has(room.id) ? 24 : 27.5;
        room.temperature = round1(room.temperature + (target - room.temperature) * 0.08 + (rand() - 0.5) * 0.3);
        room.humidity = Math.min(75, Math.max(40, room.humidity + Math.round((rand() - 0.5) * 2)));
      }
      if (room.capacity && room.occupancy != null && rand() < 0.08) {
        const before = room.occupancy;
        room.occupancy = Math.min(room.capacity, Math.max(0, room.occupancy + (rand() < 0.5 ? -1 : 1)));
        const presence = state.devices.find((d) => d.roomId === room.id && d.type === 'presence' && d.online);
        if (presence) presence.on = room.occupancy > 0;
        if (presence && (before > 0) !== (room.occupancy > 0)) logActivity(state, room.id, room.occupancy > 0 ? 'Orang terdeteksi' : 'Tidak ada orang');
      }
    }
  }
  const now = new Date().toISOString();
  for (const d of state.devices) if (d.online) d.lastSeen = now;
  stepEnergy(state.energy, state, dtSec, rand);
  state.updatedAt = now;
}

/* ------------------------------------------------------------------ */
/* Parkir & computer vision                                            */
/* ------------------------------------------------------------------ */

// Satu lokasi: Smart Parking (parkir susun, piloting), 24 slot mobil (3 tingkat × 8 slot).
const ZONES = [{ id: 'SP', name: 'Smart Parking', location: 'Parkir susun', kind: 'car', rows: 3, cols: 8, fill: 0.8 }];

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
function plate(rand) {
  const prefix = ['B', 'B', 'B', 'D', 'F', 'A'][Math.floor(rand() * 6)];
  const num = 1000 + Math.floor(rand() * 8999);
  const len = 2 + Math.floor(rand() * 2);
  let suffix = '';
  for (let i = 0; i < len; i++) suffix += PLATE_LETTERS[Math.floor(rand() * PLATE_LETTERS.length)];
  return `${prefix} ${num} ${suffix}`;
}

function minutesAgo(min) {
  return new Date(Date.now() - min * 60000).toISOString();
}

/* Riwayat kendaraan: satu baris per kunjungan (plat, jam masuk, jam keluar). */

const VISIT_LIMIT = 220;
const GATES = ['Gerbang Smart Parking'];
const confidence = (rand) => Math.round((0.9 + rand() * 0.09) * 100) / 100;

function seedVisits(zones, rand) {
  const now = Date.now();
  const visits = [];
  // Kendaraan yang sedang parkir: jam masuk = sejak kapan slot terisi.
  for (const zone of zones) {
    for (const s of zone.slots.filter((x) => x.occupied)) {
      visits.push({ id: `VS-${s.id}`, plate: s.plate, vehicleType: s.vehicleType, zoneId: zone.id, slotId: s.id, gateIn: GATES[Math.floor(rand() * GATES.length)], gateOut: null, inAt: s.since, outAt: null, confidence: confidence(rand) });
    }
  }
  // Kendaraan yang sudah keluar hari ini.
  const dayStart = new Date();
  dayStart.setHours(6, 0, 0, 0);
  const span = Math.max(0, now - dayStart.getTime() - 30 * 60000);
  const done = span ? 9 : 0;
  for (let i = 0; i < done; i++) {
    const zone = zones[Math.floor(rand() * zones.length)];
    const inAt = dayStart.getTime() + rand() * span;
    const outAt = Math.min(now - 60000, inAt + (15 + rand() * 300) * 60000);
    const vehicleType = 'car';
    visits.push({ id: `VS-done-${i}`, plate: plate(rand), vehicleType, zoneId: zone.id, slotId: null, gateIn: GATES[Math.floor(rand() * GATES.length)], gateOut: GATES[Math.floor(rand() * GATES.length)], inAt: new Date(inAt).toISOString(), outAt: new Date(outAt).toISOString(), confidence: confidence(rand) });
  }
  return visits.sort((a, b) => lastMove(b).localeCompare(lastMove(a)));
}

// Waktu gerakan terakhir kunjungan (keluar bila sudah keluar, selain itu masuk).
const lastMove = (v) => v.outAt ?? v.inAt;

/* Hari-hari lalu: kunjungan dibuat ulang dari tanggalnya, lalu okupansi & jumlah masuk/keluar
   dihitung dari kunjungan itu supaya angka grafik, KPI, dan tabel saling cocok. */

const CAPACITY = ZONES.reduce((s, z) => s + z.rows * z.cols, 0);
const HOURS = Array.from({ length: 15 }, (_, i) => 6 + i); // 06.00–20.00

/** Kunjungan kendaraan pada hari yang sudah lewat, terbaru di depan. */
export function parkingDayVisits(key) {
  const rand = rngFor(`visits:${key}`);
  const day = new Date(`${key}T00:00:00`).getTime();
  const weekend = [0, 6].includes(new Date(day).getDay());
  const n = weekend ? 4 + Math.floor(rand() * 4) : 26 + Math.floor(rand() * 7);
  const visits = [];
  for (let i = 0; i < n; i++) {
    const kind = 'car';
    const zoneId = ZONES[0].id;
    const allDay = rand() < 0.62;
    const arrive = allDay ? 6.5 + rand() * 2.5 : 8 + rand() * 8;
    const stay = allDay ? 7 + rand() * 2.5 : 0.5 + rand() * 2.5;
    const leave = Math.min(21.5, arrive + stay);
    visits.push({
      id: `VS-${key}-${i}`,
      plate: plate(rand),
      vehicleType: kind,
      zoneId,
      slotId: null,
      gateIn: GATES[Math.floor(rand() * GATES.length)],
      gateOut: GATES[Math.floor(rand() * GATES.length)],
      inAt: new Date(day + arrive * 3600000).toISOString(),
      outAt: new Date(day + leave * 3600000).toISOString(),
      confidence: confidence(rand),
    });
  }
  return visits.sort((a, b) => lastMove(b).localeCompare(lastMove(a)));
}

const countByType = (list) => {
  const out = { car: 0, motorcycle: 0, truck: 0 };
  list.forEach((v) => (out[v.vehicleType] += 1));
  return out;
};

/**
 * Statistik parkir satu hari dari daftar kunjungannya.
 * `untilHour` membatasi jam yang dihitung (hari ini: jam sekarang); jam sesudahnya bernilai null.
 */
export function parkingStatsFromVisits(key, visits, untilHour = 24) {
  const day = new Date(`${key}T00:00:00`).getTime();
  const hourly = HOURS.map((h) => {
    if (h > untilHour) return { hour: `${pad2(h)}:00`, occupancy: null };
    const t = day + (h + 0.5) * 3600000;
    const inside = visits.filter((v) => new Date(v.inAt).getTime() <= t && (!v.outAt || new Date(v.outAt).getTime() > t)).length;
    return { hour: `${pad2(h)}:00`, occupancy: Math.min(1, inside / CAPACITY) };
  });
  const done = visits.filter((v) => v.outAt);
  const minutes = done.reduce((s, v) => s + (new Date(v.outAt) - new Date(v.inAt)) / 60000, 0);
  return { date: key, hourly, in: countByType(visits), out: countByType(done), avgDurationMin: done.length ? minutes / done.length : 0 };
}

export function createParkingState(seed = 7310) {
  const rand = createRng(seed);
  const zones = ZONES.map(({ fill, ...zone }) => {
    const total = zone.rows * zone.cols;
    const slots = Array.from({ length: total }, (_, i) => {
      const id = `${zone.id}-${pad2(i + 1)}`;
      const reserved = null;
      const occupied = rand() < fill;
      return {
        id,
        reserved,
        occupied,
        vehicleType: occupied ? 'car' : null,
        plate: occupied ? plate(rand) : null,
        since: occupied ? minutesAgo(10 + Math.floor(rand() * 420)) : null,
      };
    });
    return { ...zone, slots };
  });


  const events = [];
  let t = 1;
  for (let i = 0; i < 14; i++) {
    t += 4 + Math.floor(rand() * 20);
    const type = 'car';
    events.push({
      id: `EV-${1000 - i}`,
      time: minutesAgo(t),
      gate: GATES[Math.floor(rand() * GATES.length)],
      direction: rand() < 0.6 ? 'in' : 'out',
      vehicleType: type,
      plate: plate(rand),
      confidence: Math.round((0.9 + rand() * 0.09) * 100) / 100,
    });
  }

  // Pola okupansi per jam, 06:00–20:00.
  const curve = [0.08, 0.22, 0.58, 0.82, 0.88, 0.86, 0.71, 0.79, 0.84, 0.8, 0.66, 0.43, 0.24, 0.13, 0.08];
  const history = curve.map((v, i) => ({ hour: `${pad2(6 + i)}:00`, occupancy: Math.min(1, Math.max(0, v + (rand() - 0.5) * 0.05)) }));
  const visits = seedVisits(zones, rand);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  return {
    // Lokasi parkir yang dipantau. Saat ini satu lokasi piloting: Smart Parking (parkir susun).
    site: { id: 'smart-parking', name: 'Smart Parking', kind: 'Parkir susun', status: 'Piloting' },
    zones,
    events,
    visits,
    history,
    // Jumlah masuk/keluar hari ini mengikuti kunjungan yang tercatat sejak tengah malam.
    today: {
      in: countByType(visits.filter((v) => new Date(v.inAt) >= midnight)),
      out: countByType(visits.filter((v) => v.outAt && new Date(v.outAt) >= midnight)),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function stepParking(state, rand = Math.random) {
  const zone = state.zones[Math.floor(rand() * state.zones.length)];
  const candidates = zone.slots.filter((s) => s.reserved !== 'pimpinan');
  const slot = candidates[Math.floor(rand() * candidates.length)];
  const entering = !slot.occupied;
  const vehicleType = entering ? (zone.kind === 'car' ? 'car' : 'motorcycle') : slot.vehicleType;
  const plateNo = entering ? plate(rand) : slot.plate;

  Object.assign(slot, entering
    ? { occupied: true, vehicleType, plate: plateNo, since: new Date().toISOString() }
    : { occupied: false, vehicleType: null, plate: null, since: null });

  const now = new Date().toISOString();
  const gate = GATES[Math.floor(rand() * GATES.length)];
  const conf = confidence(rand);
  state.events.unshift({ id: `EV-${Date.now()}`, time: now, gate, direction: entering ? 'in' : 'out', vehicleType, plate: plateNo, confidence: conf });
  if (entering) {
    state.visits.unshift({ id: `VS-${Date.now()}`, plate: plateNo, vehicleType, zoneId: zone.id, slotId: slot.id, gateIn: gate, gateOut: null, inAt: now, outAt: null, confidence: conf });
  } else {
    const visit = state.visits.find((v) => v.plate === plateNo && !v.outAt);
    if (visit) Object.assign(visit, { outAt: now, gateOut: gate, slotId: null });
  }
  state.visits.sort((a, b) => lastMove(b).localeCompare(lastMove(a)));
  // Kunjungan yang masih di dalam selalu disimpan; yang sudah keluar dipangkas dari yang terlama.
  const inside = state.visits.filter((v) => !v.outAt).length;
  let doneKept = 0;
  state.visits = state.visits.filter((v) => !v.outAt || ++doneKept <= Math.max(0, VISIT_LIMIT - inside));
  state.events.length = Math.min(state.events.length, 30);
  state.today[entering ? 'in' : 'out'][vehicleType] += 1;


  const hourKey = `${pad2(new Date().getHours())}:00`;
  const point = state.history.find((h) => h.hour === hourKey);
  if (point) {
    const all = state.zones.flatMap((z) => z.slots);
    point.occupancy = all.filter((s) => s.occupied).length / all.length;
  }
  state.updatedAt = new Date().toISOString();
}
