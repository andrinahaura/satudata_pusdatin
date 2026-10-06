// Chat engine berbasis aturan (rule-based) untuk mode mock.
// Saat backend AI siap, endpoint POST /chat cukup mengembalikan bentuk respons yang sama:
//   { text, items?: [{ title, meta }], actions?: [{ label, variant, action }], suggestions?: string[], link? }
// `action` berupa data (bukan fungsi) supaya bisa dikirim dari server:
//   { type: 'setDevices', ids: string[], on: boolean } | { type: 'dismiss' }
import { DEVICE_TYPES, VEHICLE_TYPES } from '../data/device-types.js';
import { energyByFloor, findWasteRooms, getAlerts, indexIot, isWorkspace, summarizeIot, summarizeParking, devicePowerW } from './selectors.js';

export const DEFAULT_SUGGESTIONS = [
  'Lampu yang belum mati?',
  'Berapa slot parkir yang kosong?',
  'Ruang kosong tapi lampu masih menyala?',
  'Perangkat mana yang offline?',
  'Pemakaian listrik hari ini?',
  'Ruang yang belum ada orang?',
];

const TYPE_PATTERNS = [
  ['light', /\b(lampu|light)\b/],
  ['ac', /\b(ac|pendingin|air ?con)\b/],
  ['presence', /(sensor kehadiran|sensor gerak|\bhps\b)/],
  ['sensor', /\b(sensor|remote ir)\b/],
];
const PARKING = /(parkir|parkiran|slot|kendaraan|mobil|motor\b)/;

const fmt1 = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const MAX_ITEMS = 8;
// 'Lampu' -> 'lampu', tapi akronim seperti 'AC' / 'CCTV' tetap kapital.
const noun = (label) => (label === label.toUpperCase() ? label : label.toLowerCase());

function normalize(text) {
  return text.toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchFloor(q, iot) {
  if (/\bbasement\b/.test(q)) return iot.building.floors.find((f) => f.level === 0) ?? null;
  const m = q.match(/\b(?:lantai|lt)\s*(\d+)/);
  return m ? iot.building.floors.find((f) => f.level === Number(m[1])) ?? null : null;
}

function matchRoom(q, iot, floor) {
  const rooms = (floor ? floor.rooms : iot.building.floors.flatMap((f) => f.rooms)).filter((r) => r.type !== 'corridor');
  // "09 R. Tim Jaringan" cocok dengan "09 r tim jaringan" dan "tim jaringan".
  const names = (r) => {
    const n = normalize(r.name);
    return [n, n.replace(/^\d+ /, ''), n.replace(/^(\d+ )?(r|ruang) /, '')];
  };
  // Kecocokan terpanjang menang. Nama generik ("R. Katim", "Toilet Pria") ada di banyak
  // ruang/lantai: kalau lebih dari satu ruang sama-sama cocok, anggap tidak jelas.
  const scored = rooms
    .map((r) => ({ r, len: Math.max(0, ...names(r).filter((n) => n.length > 3 && q.includes(n)).map((n) => n.length)) }))
    .filter((x) => x.len > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.len));
  const top = scored.filter((x) => x.len === best);
  return top.length === 1 ? top[0].r : null;
}

function matchType(q) {
  return TYPE_PATTERNS.find(([, re]) => re.test(q))?.[0] ?? null;
}

function groupByRoom(devices, idx, describe) {
  const groups = new Map();
  for (const d of devices) {
    if (!groups.has(d.roomId)) groups.set(d.roomId, []);
    groups.get(d.roomId).push(d);
  }
  return [...groups.entries()]
    .map(([roomId, list]) => {
      const room = idx.rooms.get(roomId);
      return { title: `${idx.floors.get(room.floorId).name} · ${room.name}`, meta: describe(list), count: list.length };
    })
    .sort((a, b) => b.count - a.count);
}

function limitItems(items) {
  if (items.length <= MAX_ITEMS) return items;
  return [...items.slice(0, MAX_ITEMS), { title: `+${items.length - MAX_ITEMS} lainnya`, meta: 'lihat halaman IoT' }];
}

/* ------------------------------ intents ------------------------------ */

function controlIntent(q, ctx) {
  const { iot, idx, inScope, scopeLabel } = ctx;
  const turnOn = /\b(nyalakan|nyalain|hidupkan|aktifkan)\b/.test(q);
  const type = ctx.type && DEVICE_TYPES[ctx.type].controllable ? ctx.type : 'light';
  const meta = DEVICE_TYPES[type];
  const onlyEmpty = /(kosong|tidak ada orang|tanpa orang)/.test(q);
  const targets = iot.devices.filter((d) => {
    if (d.type !== type || !d.online || d.on === turnOn || !inScope(d)) return false;
    return !onlyEmpty || idx.rooms.get(d.roomId).occupancy === 0;
  });
  const verb = turnOn ? 'menyalakan' : 'mematikan';
  const imperative = turnOn ? 'Nyalakan' : 'Matikan';
  const state = turnOn ? meta.offLabel : meta.onLabel;
  const where = onlyEmpty ? `ruang kosong di ${scopeLabel}` : scopeLabel;

  if (!targets.length) {
    return { text: `Tidak ada ${noun(meta.label)} yang ${state} di ${where}. Tidak ada yang perlu diubah.` };
  }
  return {
    text: `Saya menemukan ${targets.length} ${noun(meta.label)} yang masih ${state} di ${where}. Konfirmasi untuk ${verb}.`,
    items: limitItems(groupByRoom(targets, idx, (list) => `${list.length} ${noun(meta.label)}`)),
    actions: [
      { label: `${imperative} ${targets.length} ${noun(meta.label)}`, variant: 'primary', action: { type: 'setDevices', ids: targets.map((d) => d.id), on: turnOn } },
      { label: 'Batal', variant: 'secondary', action: { type: 'dismiss' } },
    ],
  };
}

function parkingIntent(q, { parking }) {
  const s = summarizeParking(parking);
  const kind = /motor\b/.test(q) ? 'motorcycle' : /mobil/.test(q) ? 'car' : null;
  const scope = kind ? s[kind] : s;
  const zones = kind ? s.zones.filter((z) => z.kind === kind) : s.zones;
  const kindLabel = kind ? VEHICLE_TYPES[kind].label.toLowerCase() : 'kendaraan';
  const asksCount = /(berapa|jumlah|ada).*(terparkir|terisi|mobil|motor|kendaraan)/.test(q) && !/kosong|tersedia|sisa/.test(q);

  const text = asksCount
    ? `Saat ini ada ${scope.occupied} ${kindLabel} terparkir, dari kapasitas ${scope.total} slot. Sisa ${scope.free} slot kosong.`
    : `Tersedia ${scope.free} slot parkir ${kind ? kindLabel : ''} kosong dari ${scope.total} slot (okupansi ${Math.round((scope.occupied / scope.total) * 100)}%).`.replace('  ', ' ');
  return {
    text,
    items: zones.map((z) => ({ title: `${z.name} · ${z.location}`, meta: `${z.free} kosong · ${z.occupied} terisi` })),
    link: { label: 'Lihat peta parkir', href: '/vision.html' },
    suggestions: ['Kendaraan masuk hari ini?', 'Slot parkir motor yang kosong?'],
  };
}

function trafficIntent(q, { parking }) {
  const { in: incoming, out } = parking.today;
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    text: `Hari ini tercatat ${total(incoming)} kendaraan masuk dan ${total(out)} keluar berdasarkan deteksi kamera gerbang.`,
    items: Object.entries(VEHICLE_TYPES).map(([k, v]) => ({ title: v.label, meta: `${incoming[k]} masuk · ${out[k]} keluar` })),
    link: { label: 'Lihat riwayat deteksi', href: '/vision.html' },
  };
}

function wasteIntent(q, { iot, inScope, scopeLabel }) {
  const rooms = findWasteRooms(iot).filter((w) => w.devices.some(inScope));
  if (!rooms.length) return { text: `Tidak ada ruang kosong dengan lampu atau AC menyala di ${scopeLabel}. Bagus, tidak ada pemborosan.` };
  const ids = rooms.flatMap((w) => w.devices.filter(inScope).map((d) => d.id));
  const watt = rooms.flatMap((w) => w.devices).reduce((s, d) => s + devicePowerW(d), 0);
  return {
    text: `Ada ${rooms.length} ruangan tanpa orang yang perangkatnya masih menyala di ${scopeLabel}, sekitar ${fmt1(watt / 1000)} kW terbuang.`,
    items: limitItems(rooms.map((w) => {
      const lights = w.devices.filter((d) => d.type === 'light').length;
      const acs = w.devices.filter((d) => d.type === 'ac').length;
      return { title: `${w.floor.name} · ${w.room.name}`, meta: [lights && `${lights} lampu`, acs && `${acs} AC`].filter(Boolean).join(' · ') };
    })),
    actions: [
      { label: `Matikan ${ids.length} perangkat`, variant: 'primary', action: { type: 'setDevices', ids, on: false } },
      { label: 'Biarkan', variant: 'secondary', action: { type: 'dismiss' } },
    ],
  };
}

function alertIntent(q, { iot, parking }) {
  const offlineOnly = /(offline|tidak terhubung|terputus|rusak)/.test(q);
  const alerts = getAlerts(iot, parking).filter((a) => !offlineOnly || a.id.startsWith('off-'));
  if (!alerts.length) return { text: offlineOnly ? 'Semua perangkat online.' : 'Tidak ada peringatan aktif saat ini.' };
  return {
    text: offlineOnly ? `Ada ${alerts.length} perangkat offline.` : `Ada ${alerts.length} peringatan aktif.`,
    items: limitItems(alerts.map((a) => ({ title: a.title, meta: a.meta }))),
    link: { label: 'Buka monitoring IoT', href: '/iot.html' },
  };
}

function temperatureIntent(q, { iot, room, floor, scopeLabel }) {
  const all = (floor ? [floor] : iot.building.floors).flatMap((f) => f.rooms.map((r) => ({ f, r }))).filter(({ r }) => r.temperature != null);
  if (room) {
    if (room.temperature == null) return { text: `${room.name} belum punya sensor suhu.` };
    return { text: `Suhu ${room.name} saat ini ${fmt1(room.temperature)}°C dengan kelembaban ${room.humidity}%. ${occupancyText(room)}` };
  }
  if (/(terpanas|paling panas|panas)/.test(q) || /(terdingin|paling dingin|dingin)/.test(q)) {
    const cold = /(dingin)/.test(q);
    const sorted = [...all].sort((a, b) => (cold ? a.r.temperature - b.r.temperature : b.r.temperature - a.r.temperature)).slice(0, 5);
    return {
      text: `${cold ? 'Ruangan terdingin' : 'Ruangan terpanas'} di ${scopeLabel}: ${sorted[0].r.name} (${fmt1(sorted[0].r.temperature)}°C).`,
      items: sorted.map(({ f, r }) => ({ title: `${f.name} · ${r.name}`, meta: `${fmt1(r.temperature)}°C · ${r.humidity}%` })),
    };
  }
  const floors = floor ? [floor] : iot.building.floors;
  const avg = summarizeIot(iot, floor?.id).avgTemp;
  return {
    text: `Suhu rata-rata ${scopeLabel} ${fmt1(avg)}°C.`,
    items: floors.map((f) => {
      const s = summarizeIot(iot, f.id);
      return { title: `${f.name} · ${f.label}`, meta: `${fmt1(s.avgTemp)}°C · kelembaban ${Math.round(s.avgHumidity)}%` };
    }),
    suggestions: ['Ruangan terpanas?', 'Suhu 09 R. Tim Jaringan?'],
  };
}

function energyIntent(q, { iot, floor, scopeLabel }) {
  const period = /minggu/.test(q) ? 'mingguan' : /bulan/.test(q) ? 'bulanan' : 'harian';
  const periodLabel = { harian: 'hari ini', mingguan: 'minggu ini', bulanan: 'bulan ini' }[period];
  const previousLabel = { harian: 'kemarin', mingguan: 'minggu lalu', bulanan: 'bulan lalu' }[period];
  const e = energyByFloor(iot, period);
  const scope = floor ? e.floors.find((f) => f.floor.id === floor.id) : e;
  const rupiah = (v) => `Rp ${Math.round(v).toLocaleString('id-ID')}`;
  const change = Math.round(scope.change * 100);
  const items = floor
    ? Object.entries(DEVICE_TYPES).map(([t, m]) => {
        const w = iot.devices.filter((d) => d.type === t && d.floorId === floor.id).reduce((a, d) => a + devicePowerW(d), 0);
        return { title: `Beban ${noun(m.label)} saat ini`, meta: `${fmt1(w / 1000)} kW` };
      })
    : e.floors.map((f) => ({ title: f.floor.name, meta: `${fmt1(f.kwh)} kWh · ${rupiah(f.rupiah)}${f.anomaly ? ' · di atas target' : ''}` }));
  return {
    text: `Pemakaian listrik ${scopeLabel} ${periodLabel} ${fmt1(scope.kwh)} kWh (${rupiah(scope.rupiah)}), ${change <= 0 ? 'turun' : 'naik'} ${Math.abs(change)}% dibanding ${previousLabel} pada titik yang sama.`,
    items,
    link: { label: 'Lihat grafik listrik', href: '/iot.html#listrik' },
    suggestions: ['Pemakaian listrik bulan ini?', 'Ruang kosong tapi lampu masih menyala?'],
  };
}

function occupancyText(room) {
  if (room.occupancy == null) return 'Sensor kehadiran belum terpasang.';
  return room.occupancy > 0 ? `Ada ${room.occupancy} orang di ruangan.` : 'Tidak ada orang di ruangan.';
}

function occupancyIntent(q, { iot, floor, scopeLabel }) {
  const floors = floor ? [floor] : iot.building.floors;
  if (/(kosong|belum ada orang|tidak ada orang)/.test(q)) {
    const empty = floors.flatMap((f) => f.rooms.filter((r) => isWorkspace(r) && r.occupancy === 0).map((r) => ({ title: `${f.name} · ${r.name}`, meta: 'Sensor kehadiran: kosong' })));
    return { text: `Ada ${empty.length} ruangan kosong di ${scopeLabel}.`, items: limitItems(empty) };
  }
  const s = summarizeIot(iot, floor?.id);
  return {
    text: `Terdeteksi ${s.people} orang di ${scopeLabel}. ${s.occupiedRooms} dari ${s.workspaceRooms} ruang kerja sedang terpakai.`,
    items: floors.map((f) => {
      const fs = summarizeIot(iot, f.id);
      return { title: `${f.name} · ${f.label}`, meta: `${fs.people} orang · ${fs.occupiedRooms}/${fs.workspaceRooms} ruang terpakai` };
    }),
  };
}

function deviceStatusIntent(q, ctx) {
  const { iot, idx, inScope, scopeLabel, type } = ctx;
  const meta = DEVICE_TYPES[type];
  const wantsOff = /\b(mati|off|padam|terbuka|nonaktif)\b/.test(q) && !/(belum|tidak|masih) (mati|padam)/.test(q);
  const scoped = iot.devices.filter((d) => d.type === type && inScope(d));
  const list = scoped.filter((d) => (wantsOff ? !d.on || !d.online : d.on && d.online));
  const label = noun(meta.label);
  const state = wantsOff ? meta.offLabel : meta.onLabel;

  if (!list.length) {
    return { text: wantsOff ? `Semua ${label} di ${scopeLabel} sedang ${meta.onLabel}.` : `Semua ${label} di ${scopeLabel} sudah ${meta.offLabel}.` };
  }
  const roomCount = new Set(list.map((d) => d.roomId)).size;
  const res = {
    text: `Ada ${list.length} dari ${scoped.length} ${label} yang ${wantsOff ? '' : 'masih '}${state} di ${scopeLabel}, tersebar di ${roomCount} ruangan.`,
    items: limitItems(groupByRoom(list, idx, (l) => `${l.length} ${label} ${state}`)),
  };
  if (meta.controllable && !wantsOff) {
    res.actions = [{ label: `Matikan ${list.length} ${label}`, variant: 'primary', action: { type: 'setDevices', ids: list.map((d) => d.id), on: false } }];
    res.suggestions = ['Ruang kosong tapi lampu masih menyala?'];
  }
  return res;
}

function scopeSummary({ iot, room, floor, scopeLabel }) {
  if (room) {
    const devices = iot.devices.filter((d) => d.roomId === room.id);
    const climate = room.temperature != null ? `${fmt1(room.temperature)}°C, kelembaban ${room.humidity}%. ` : '';
    return {
      text: room.equipped ? `${room.name}: ${climate}${occupancyText(room)}` : `${room.name}: sensor belum terpasang.`,
      items: devices.map((d) => ({ title: d.name, meta: d.online ? (d.on ? DEVICE_TYPES[d.type].onLabel : DEVICE_TYPES[d.type].offLabel) : 'offline' })),
    };
  }
  const s = summarizeIot(iot, floor?.id);
  return {
    text: `Ringkasan ${scopeLabel}: ${s.byType.light.on} lampu dan ${s.byType.ac.on} AC menyala, suhu rata-rata ${fmt1(s.avgTemp)}°C, ${s.people} orang, beban ${fmt1(s.powerKw)} kW.`,
  };
}

/* ------------------------------- entry ------------------------------- */

export function answer(message, { iot, parking }) {
  const q = normalize(message);
  const idx = indexIot(iot);
  const floor = matchFloor(q, iot);
  const room = matchRoom(q, iot, floor);
  const type = matchType(q);
  const scopeLabel = room ? `${room.name} (${idx.floors.get(room.floorId).name})` : floor ? floor.name : 'seluruh gedung';
  const inScope = (d) => (!floor || d.floorId === floor.id) && (!room || d.roomId === room.id);
  const ctx = { iot, parking, idx, floor, room, type, scopeLabel, inScope };

  if (!q) return fallback();
  if (/\b(matikan|matiin|padamkan|nyalakan|nyalain|hidupkan|aktifkan)\b/.test(q)) return controlIntent(q, ctx);
  if (/(masuk|keluar|lalu lintas|lewat)/.test(q) && PARKING.test(q)) return trafficIntent(q, ctx);
  if (PARKING.test(q)) return parkingIntent(q, ctx);
  if (/(boros|pemborosan)/.test(q) || (/(kosong|tidak ada orang|tanpa orang)/.test(q) && (type === 'light' || type === 'ac'))) return wasteIntent(q, ctx);
  if (/(offline|rusak|error|gangguan|bermasalah|tidak terhubung|terputus|peringatan|alert|masalah)/.test(q)) return alertIntent(q, ctx);
  if (/(suhu|panas|dingin|temperatur|kelembab)/.test(q)) return temperatureIntent(q, ctx);
  if (/(energi|listrik|daya|watt|konsumsi|kwh|beban)/.test(q)) return energyIntent(q, ctx);
  if (/(orang|penghuni|okupansi|ramai|sepi|kosong)/.test(q)) return occupancyIntent(q, ctx);
  if (type) return deviceStatusIntent(q, ctx);
  if (room || floor) return scopeSummary(ctx);
  if (/\b(halo|hai|hi|hello|pagi|siang|sore|malam|bantuan|help|bisa apa)\b/.test(q)) {
    return {
      text: 'Saya membaca status perangkat IoT, kondisi ruang, pemakaian listrik, dan parkir Gedung Pusdatin. Saya juga bisa mematikan lampu atau AC yang tidak terpakai.',
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    };
  }
  return fallback();
}

function fallback() {
  return {
    text: 'Maaf, saya belum memahami pertanyaan itu. Coba tanyakan soal lampu, AC, suhu, listrik, perangkat offline, atau parkir. Sebutkan lantai atau nama ruangan bila perlu.',
    suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
  };
}
