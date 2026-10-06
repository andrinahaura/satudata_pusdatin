// Generator data simulasi. Bentuk objek yang dihasilkan di sini = kontrak data
// yang diharapkan dari backend (lihat README "Kontrak API").
import { DEVICE_TYPES, NON_WORKSPACE } from './device-types.js';

// PRNG deterministik supaya denah & status sama di setiap halaman/reload.
function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const round1 = (n) => Math.round(n * 10) / 10;
const pad2 = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ */
/* Denah gedung                                                        */
/* ------------------------------------------------------------------ */

// Koordinat denah memakai viewBox 1000 x 560. Dinding luar 20..980 x 20..540,
// koridor tengah y 250..310. Setiap baris lebar totalnya 960.
const ROW_TOP = { y: 20, h: 230 };
const CORRIDOR = { y: 250, h: 60 };
const ROW_BOTTOM = { y: 310, h: 230 };

const FLOORS = [
  {
    level: 1,
    label: 'Lobby & Layanan Publik',
    top: [['Lobby', 320, 'lobby'], ['Layanan Publik', 240, 'office'], ['Ruang Tunggu', 160, 'hall'], ['Pos Keamanan', 120, 'office'], ['Toilet', 120, 'toilet']],
    bottom: [['Ruang Arsip', 200, 'office'], ['Pantry', 140, 'pantry'], ['Lift & Tangga', 140, 'core'], ['Mushola', 160, 'hall'], ['Ruang Rapat 1A', 320, 'meeting']],
  },
  {
    level: 2,
    label: 'Pengelolaan Data',
    top: [['Ruang Kerja Data 1', 300, 'office'], ['Ruang Kerja Data 2', 260, 'office'], ['Ruang Kabid', 160, 'office'], ['Ruang Rapat 2A', 240, 'meeting']],
    bottom: [['Ruang Statistik', 280, 'office'], ['Pantry', 120, 'pantry'], ['Lift & Tangga', 140, 'core'], ['Toilet', 120, 'toilet'], ['Ruang Rapat 2B', 300, 'meeting']],
  },
  {
    level: 3,
    label: 'Infrastruktur TI',
    top: [['Ruang Server', 280, 'server'], ['NOC', 240, 'office'], ['Ruang UPS', 140, 'server'], ['Gudang TI', 140, 'storage'], ['Ruang Teknisi', 160, 'office']],
    bottom: [['Lab Pengembangan', 300, 'lab'], ['Ruang Developer', 220, 'office'], ['Lift & Tangga', 140, 'core'], ['Toilet', 120, 'toilet'], ['Ruang Diskusi', 180, 'meeting']],
  },
  {
    level: 4,
    label: 'Pimpinan',
    top: [['Ruang Kepala Pusat', 260, 'office'], ['Sekretariat', 160, 'office'], ['Ruang Tamu VIP', 200, 'lobby'], ['Aula', 340, 'hall']],
    bottom: [['Rapat Pimpinan', 320, 'meeting'], ['Pantry', 120, 'pantry'], ['Lift & Tangga', 140, 'core'], ['Toilet', 120, 'toilet'], ['Ruang Staf', 260, 'office']],
  },
];

function layoutRow(specs, { y, h }, floorId, startIndex) {
  let x = 20;
  return specs.map(([name, w, type], i) => {
    const room = { id: `${floorId}-R${pad2(startIndex + i + 1)}`, floorId, name, type, x, y, w, h };
    x += w;
    return room;
  });
}

function lightPositions(room, n) {
  if (room.type === 'corridor') {
    return Array.from({ length: n }, (_, i) => ({ x: room.x + ((i + 0.5) * room.w) / n, y: room.y + room.h / 2 }));
  }
  const padX = 34;
  const top = 58;
  const bottom = 40;
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
  const code = { light: 'LMP', ac: 'AC', sensor: 'SNS', cctv: 'CAM', lock: 'LCK' }[type];
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

export function createIotState(seed = 20261005) {
  const rand = createRng(seed);
  const floors = [];
  const devices = [];

  for (const def of FLOORS) {
    const floorId = `L${def.level}`;
    const top = layoutRow(def.top, ROW_TOP, floorId, 0);
    const bottom = layoutRow(def.bottom, ROW_BOTTOM, floorId, top.length);
    const corridor = { id: `${floorId}-KOR`, floorId, name: 'Koridor', type: 'corridor', x: 20, y: CORRIDOR.y, w: 960, h: CORRIDOR.h };
    const rooms = [...top, corridor, ...bottom];

    for (const room of rooms) {
      const workspace = !NON_WORKSPACE.has(room.type);
      room.capacity = !workspace ? 0 : room.type === 'server' || room.type === 'storage' ? 2 : Math.max(2, Math.round((room.w * room.h) / 7000));
      const empty = !workspace || rand() < 0.3;
      room.occupancy = empty ? 0 : 1 + Math.floor(rand() * room.capacity);

      // Lampu
      if (room.type !== 'core') {
        const n = room.type === 'corridor' ? 6 : Math.max(1, Math.min(6, Math.round((room.w * room.h) / 12000)));
        const pOn = room.type === 'corridor' ? 0.85 : room.occupancy > 0 ? 0.92 : 0.22;
        lightPositions(room, n).forEach((pos, i) => devices.push(makeDevice(room, 'light', i + 1, pos, { on: rand() < pOn })));
      }

      // AC
      if (workspace || room.type === 'server') {
        const n = room.w >= 280 ? 2 : 1;
        const pOn = room.type === 'server' ? 1 : room.occupancy > 0 ? 0.88 : 0.25;
        for (let i = 0; i < n; i++) {
          const pos = { x: room.x + room.w - 24 - i * 30, y: room.y + room.h - 22 };
          devices.push(makeDevice(room, 'ac', i + 1, pos, { on: rand() < pOn, setpoint: room.type === 'server' ? 20 : 24 }));
        }
      }

      // Sensor lingkungan (suhu, kelembaban, okupansi)
      if (room.type !== 'core' && room.type !== 'corridor') {
        devices.push(makeDevice(room, 'sensor', 1, { x: room.x + 22, y: room.y + room.h - 22 }));
      }

      // CCTV
      if (room.type === 'corridor') {
        [140, 500, 860].forEach((x, i) => devices.push(makeDevice(room, 'cctv', i + 1, { x, y: room.y + 14 })));
      } else if (room.type === 'lobby' || room.type === 'server') {
        devices.push(makeDevice(room, 'cctv', 1, { x: room.x + room.w - 22, y: room.y + 22 }));
      }

      // Smart lock
      if (room.type === 'server' || room.name === 'Ruang Kepala Pusat' || room.name === 'Ruang Arsip') {
        // Pintu ada di sisi koridor.
        const pos = room.y === ROW_TOP.y ? { x: room.x + room.w / 2, y: room.y + room.h - 22 } : { x: room.x + room.w - 22, y: room.y + 22 };
        devices.push(makeDevice(room, 'lock', 1, pos, { on: rand() < 0.85 }));
      }
    }

    floors.push({ id: floorId, level: def.level, name: `Lantai ${def.level}`, label: def.label, rooms });
  }

  // Kondisi lingkungan awal per ruangan, mengikuti status AC.
  for (const floor of floors) {
    for (const room of floor.rooms) {
      const acOn = devices.some((d) => d.roomId === room.id && d.type === 'ac' && d.on);
      const base = room.type === 'server' ? (acOn ? 20.5 : 27) : acOn ? 23.5 : 27;
      room.temperature = round1(base + rand() * 1.8);
      room.humidity = Math.round(50 + rand() * 15);
    }
  }

  // Skenario demo: beberapa perangkat offline & Ruang UPS kepanasan.
  const pick = (pred) => devices.find(pred);
  for (const d of [
    pick((d) => d.floorId === 'L2' && d.type === 'light' && d.roomId.endsWith('R02')),
    pick((d) => d.floorId === 'L3' && d.type === 'cctv'),
    // AC Ruang UPS rusak sehingga suhunya naik (memicu peringatan suhu).
    pick((d) => d.type === 'ac' && d.roomId === floors[2].rooms.find((r) => r.name === 'Ruang UPS')?.id),
  ]) {
    if (d) Object.assign(d, { online: false, on: false, lastSeen: new Date(Date.now() - 42 * 60000).toISOString() });
  }
  const ups = floors[2].rooms.find((r) => r.name === 'Ruang UPS');
  if (ups) ups.temperature = 28.6;

  return {
    building: { id: 'pusdatin', name: 'Gedung Pusdatin', floors },
    devices,
    updatedAt: new Date().toISOString(),
  };
}

// Simulasi perubahan realtime (dipanggil tiap interval oleh mock backend).
export function stepIot(state, rand = Math.random) {
  const acOnByRoom = new Set(state.devices.filter((d) => d.type === 'ac' && d.on && d.online).map((d) => d.roomId));
  for (const floor of state.building.floors) {
    for (const room of floor.rooms) {
      const target = acOnByRoom.has(room.id) ? (room.type === 'server' ? 20.5 : 24) : 27.5;
      room.temperature = round1(room.temperature + (target - room.temperature) * 0.08 + (rand() - 0.5) * 0.3);
      room.humidity = Math.min(75, Math.max(40, room.humidity + Math.round((rand() - 0.5) * 2)));
      if (room.capacity && rand() < 0.08) {
        room.occupancy = Math.min(room.capacity, Math.max(0, room.occupancy + (rand() < 0.5 ? -1 : 1)));
      }
    }
  }
  const now = new Date().toISOString();
  for (const d of state.devices) if (d.online) d.lastSeen = now;
  state.updatedAt = now;
}

/* ------------------------------------------------------------------ */
/* Parkir & computer vision                                            */
/* ------------------------------------------------------------------ */

const ZONES = [
  { id: 'A', name: 'Area A', location: 'Basement', kind: 'car', rows: 2, cols: 16, fill: 0.78 },
  { id: 'B', name: 'Area B', location: 'Halaman depan', kind: 'car', rows: 2, cols: 10, fill: 0.6 },
  { id: 'M', name: 'Area Motor', location: 'Samping gedung', kind: 'motorcycle', rows: 3, cols: 20, fill: 0.82 },
];

const CAMERAS = [
  { id: 'CAM-01', name: 'Gerbang Masuk', zoneId: null },
  { id: 'CAM-02', name: 'Area A · Basement', zoneId: 'A' },
  { id: 'CAM-03', name: 'Area B · Halaman', zoneId: 'B' },
  { id: 'CAM-04', name: 'Area Motor', zoneId: 'M' },
];

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

// Bounding box deteksi palsu dalam persen frame kamera [x, y, w, h].
function detectionsFor(camera, zone, slots, rand) {
  if (!zone) {
    const n = 1 + Math.floor(rand() * 2);
    return Array.from({ length: n }, (_, i) => ({
      label: rand() < 0.6 ? 'mobil' : 'motor',
      confidence: Math.round((0.88 + rand() * 0.11) * 100) / 100,
      box: [18 + i * 38, 36 + rand() * 8, 30, 40],
    }));
  }
  const occupied = slots.filter((s) => s.occupied).slice(0, zone.kind === 'car' ? 8 : 10);
  const perRow = zone.kind === 'car' ? 4 : 5;
  const w = zone.kind === 'car' ? 19 : 14;
  return occupied.map((s, i) => {
    const row = Math.floor(i / perRow) % 2;
    const col = i % perRow;
    return {
      label: zone.kind === 'car' ? 'mobil' : 'motor',
      confidence: Math.round((0.86 + rand() * 0.13) * 100) / 100,
      slotId: s.id,
      box: [4 + col * (96 / perRow) + rand() * 2, row === 0 ? 30 + rand() * 3 : 62 + rand() * 3, w, row === 0 ? 26 : 32],
    };
  });
}

export function createParkingState(seed = 7310) {
  const rand = createRng(seed);
  const zones = ZONES.map(({ fill, ...zone }) => {
    const total = zone.rows * zone.cols;
    const slots = Array.from({ length: total }, (_, i) => {
      const id = `${zone.id}-${pad2(i + 1)}`;
      let reserved = null;
      if (zone.id === 'A' && i < 2) reserved = 'disabilitas';
      if (zone.id === 'A' && i >= total - 3) reserved = 'pimpinan';
      const occupied = rand() < (reserved === 'disabilitas' ? 0.3 : fill);
      return {
        id,
        reserved,
        occupied,
        vehicleType: occupied ? (zone.kind === 'car' ? (rand() < 0.06 ? 'truck' : 'car') : 'motorcycle') : null,
        plate: occupied ? plate(rand) : null,
        since: occupied ? minutesAgo(10 + Math.floor(rand() * 420)) : null,
      };
    });
    return { ...zone, slots };
  });

  const cameras = CAMERAS.map((cam) => {
    const zone = zones.find((z) => z.id === cam.zoneId);
    return { ...cam, streamUrl: null, online: true, detections: detectionsFor(cam, zone, zone?.slots ?? [], rand) };
  });

  const events = [];
  let t = 1;
  for (let i = 0; i < 14; i++) {
    t += 1 + Math.floor(rand() * 6);
    const type = rand() < 0.62 ? 'motorcycle' : rand() < 0.94 ? 'car' : 'truck';
    events.push({
      id: `EV-${1000 - i}`,
      time: minutesAgo(t),
      gate: rand() < 0.5 ? 'Gerbang 1' : 'Gerbang 2',
      direction: rand() < 0.6 ? 'in' : 'out',
      vehicleType: type,
      plate: plate(rand),
      confidence: Math.round((0.9 + rand() * 0.09) * 100) / 100,
    });
  }

  // Pola okupansi per jam, 06:00–20:00.
  const curve = [0.08, 0.22, 0.58, 0.82, 0.88, 0.86, 0.71, 0.79, 0.84, 0.8, 0.66, 0.43, 0.24, 0.13, 0.08];
  const history = curve.map((v, i) => ({ hour: `${pad2(6 + i)}:00`, occupancy: Math.min(1, Math.max(0, v + (rand() - 0.5) * 0.05)) }));

  return {
    zones,
    cameras,
    events,
    history,
    today: {
      in: { car: 148, motorcycle: 263, truck: 6 },
      out: { car: 97, motorcycle: 171, truck: 4 },
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

  state.events.unshift({
    id: `EV-${Date.now()}`,
    time: new Date().toISOString(),
    gate: rand() < 0.5 ? 'Gerbang 1' : 'Gerbang 2',
    direction: entering ? 'in' : 'out',
    vehicleType,
    plate: plateNo,
    confidence: Math.round((0.9 + rand() * 0.09) * 100) / 100,
  });
  state.events.length = Math.min(state.events.length, 30);
  state.today[entering ? 'in' : 'out'][vehicleType] += 1;

  for (const cam of state.cameras) {
    const z = state.zones.find((x) => x.id === cam.zoneId);
    if (!z || z === zone) cam.detections = detectionsFor(cam, z, z?.slots ?? [], rand);
  }

  const hourKey = `${pad2(new Date().getHours())}:00`;
  const point = state.history.find((h) => h.hour === hourKey);
  if (point) {
    const all = state.zones.flatMap((z) => z.slots);
    point.occupancy = all.filter((s) => s.occupied).length / all.length;
  }
  state.updatedAt = new Date().toISOString();
}
