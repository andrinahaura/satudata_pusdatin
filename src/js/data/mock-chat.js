// Analitik chatbot untuk mode simulasi. Bentuk respons = kontrak GET /chat/analytics?from=&to=.
//   users   : pengguna yang pernah memakai chatbot (nama, unit, login terakhir)
//   days    : satu baris per hari di rentang: pertanyaan, token per model, pertanyaan per jam,
//             dan per pengguna (jumlah pertanyaan, ulasan sesuai / tidak sesuai)
//   history : riwayat chat di rentang (pertanyaan, jawaban, model, token, penilaian), terbaru di depan
// Hari-hari lalu dibuat ulang dari tanggalnya (chatDay). Hari ini disimpan di state karena
// bertambah setiap ada pertanyaan dari dashboard, dicatat atas nama CURRENT_USER (belum ada SSO).
import { MODELS } from './chat-models.js';
import { atHour, isWeekendKey, rngFor } from './mock-util.js';
import { dateKey, parseKey } from '../utils/range.js';

const HISTORY_LIMIT = 100;
const LOOKBACK_DAYS = 120;
// Tanggal mulai chatbot dipakai; pemakaian naik pelan sejak tanggal ini.
const LAUNCH = parseKey('2026-05-01');

// Nama contoh (fiktif). Unit mengikuti pintas unit organisasi di chatbot.
const FIRST = ['Andi', 'Rina', 'Dimas', 'Sari', 'Budi', 'Putri', 'Fajar', 'Lestari', 'Agus', 'Wulan', 'Hendra', 'Maya', 'Rizky', 'Nadia', 'Yoga', 'Intan', 'Arif', 'Dewi', 'Bayu', 'Citra', 'Eko', 'Fitri'];
const LAST = ['Pratama', 'Wijaya', 'Saputra', 'Lestari', 'Nugroho', 'Hidayat', 'Kusuma', 'Permana', 'Santoso', 'Rahayu', 'Setiawan'];
const USER_UNITS = ['Pusdatin', 'Pusdatin', 'Pusdatin', 'Sekjen', 'SDA', 'Bina Marga', 'Cipta Karya', 'Prasarana Strategis', 'Pembiayaan', 'BPSDM'];

export const CURRENT_USER = { id: 'U-ADMIN', name: 'Admin Pusdatin', unit: 'Pusdatin' };

const USERS = (() => {
  const rand = rngFor('chat-users');
  return Array.from({ length: 26 }, (_, i) => ({
    id: `U-${String(i + 1).padStart(2, '0')}`,
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    unit: USER_UNITS[Math.floor(rand() * USER_UNITS.length)],
    weight: 0.3 + rand(),
  }));
})();

// Contoh tanya-jawab. 'bad' = jawaban yang sering dinilai Tidak sesuai.
const SAMPLE_BUILDING = [
  ['Lampu yang belum mati di lantai 1?', 'Ada 9 lampu yang masih menyala di Lantai 1, tersebar di 4 ruangan. Terbanyak di Lobby (3 lampu).'],
  ['Berapa slot parkir yang kosong?', 'Tersedia 5 slot kosong di Smart Parking dari 24 slot (okupansi 79%).'],
  ['Pemakaian listrik hari ini?', 'Pemakaian listrik seluruh gedung hari ini 104,2 kWh (Rp 179.953), turun 12% dibanding kemarin pada jam yang sama.'],
  ['Perangkat mana yang offline?', 'Ada 3 perangkat offline: Lampu 1 di 22 R. Katim, AC 1 di 09 R. Tim Jaringan, dan sensor kehadiran di Mushola.'],
  ['Ruang kosong tapi AC masih menyala?', 'Workspace Lt 2 kosong tetapi 2 AC dan 4 lampu masih menyala, sekitar 1,8 kW terbuang.'],
  ['Jadwal pemeliharaan genset bulan ini?', 'Maaf, saya belum memahami pertanyaan itu. Coba tanyakan soal lampu, AC, suhu, listrik, perangkat offline, atau parkir.', 'bad'],
  ['Berapa sisa anggaran listrik tahun ini?', 'Pemakaian listrik bulan ini 2.840 kWh (Rp 4.904.680). Data anggaran tahunan belum tersedia di chatbot.', 'bad'],
];
const SAMPLE_DOCUMENT = [
  ['Siapa yang menandatangani nota dinas?', 'Nota dinas ditandatangani pejabat paling rendah setingkat eselon III dan ditujukan kepada pejabat setingkat atau satu tingkat di atasnya. [1]'],
  ['Kapan pemeliharaan rutin saluran irigasi tersier?', 'Pemeliharaan rutin dilakukan setiap awal musim tanam: pembersihan sedimen, perbaikan tanggul kecil, dan pengecekan pintu air. [1]'],
  ['Kejadian bencana yang masih tanggap darurat?', 'Data SITABA mencatat 2 kejadian yang masih tanggap darurat: banjir di Kab. Bekasi dan tanah longsor di Kab. Bogor.'],
  ['Berapa jam pelajaran pengembangan kompetensi per tahun?', 'Setiap pegawai mengikuti pengembangan kompetensi paling sedikit 20 jam pelajaran dalam satu tahun. [1]'],
  ['Prosedur peminjaman mobil dinas?', 'Saya tidak menemukan dokumen yang membahas peminjaman mobil dinas. Coba gunakan kata kunci lain, atau lampirkan dokumennya.', 'bad'],
];

// Sebaran pertanyaan per jam di hari kerja.
const HOUR_WEIGHT = [0, 0, 0, 0, 0, 0, 0.2, 0.6, 1.4, 1.8, 1.7, 1.3, 0.7, 1.4, 1.6, 1.3, 0.9, 0.4, 0.2, 0.1, 0.1, 0, 0, 0];
const HOUR_SUM = HOUR_WEIGHT.reduce((a, b) => a + b, 0);

function pickHour(rand) {
  let r = rand() * HOUR_SUM;
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHT[h];
    if (r <= 0) return h;
  }
  return 10;
}

function emptyDay(date) {
  return {
    date,
    questions: 0,
    inputTokens: 0,
    outputTokens: 0,
    byModel: Object.fromEntries(MODELS.map((m) => [m, { questions: 0, inputTokens: 0, outputTokens: 0 }])),
    hours: Array.from({ length: 24 }, () => ({ questions: 0, inputTokens: 0, outputTokens: 0, byModel: {} })),
    users: {},
    entries: [],
  };
}

function addEntry(day, e) {
  const m = day.byModel[e.model] ?? (day.byModel[e.model] = { questions: 0, inputTokens: 0, outputTokens: 0 });
  m.questions += 1;
  m.inputTokens += e.inputTokens;
  m.outputTokens += e.outputTokens;
  day.questions += 1;
  day.inputTokens += e.inputTokens;
  day.outputTokens += e.outputTokens;
  const hour = day.hours[new Date(e.time).getHours()];
  hour.questions += 1;
  hour.inputTokens += e.inputTokens;
  hour.outputTokens += e.outputTokens;
  const hm = hour.byModel[e.model] ?? (hour.byModel[e.model] = { inputTokens: 0, outputTokens: 0 });
  hm.inputTokens += e.inputTokens;
  hm.outputTokens += e.outputTokens;
  const u = day.users[e.userId] ?? (day.users[e.userId] = { questions: 0, up: 0, down: 0 });
  u.questions += 1;
  if (e.rating) u[e.rating] += 1;
  day.entries.push(e);
}

const cache = new Map();

/** Statistik dan riwayat satu hari yang sudah lewat (atau hari ini sampai `until`). */
export function chatDay(key, until = null) {
  if (!until && cache.has(key)) return cache.get(key);
  const rand = rngFor(`chat:${key}`);
  const day = emptyDay(key);
  const date = parseKey(key);
  if (date >= LAUNCH) {
    const growth = Math.min(1, (date - LAUNCH) / (150 * 86400000));
    const n = Math.round(isWeekendKey(key) ? 4 + rand() * 4 : (16 + 22 * growth) * (0.8 + rand() * 0.4));
    // Hanya sebagian pengguna yang aktif dalam satu hari.
    const active = USERS.filter((u) => rand() < 0.25 * u.weight + 0.08);
    const pool = active.length ? active : [USERS[0]];
    const entries = [];
    for (let i = 0; i < n; i++) {
      const user = pool[Math.floor(rand() * pool.length)];
      // Jawaban kurang tepat (quality 'bad') muncul ± 1 dari 10 pertanyaan.
      const all = user.unit === 'Pusdatin' ? SAMPLE_BUILDING : SAMPLE_DOCUMENT;
      const bad = rand() < 0.1;
      const samples = all.filter((x) => (x[2] === 'bad') === bad);
      const [question, answer, quality] = samples[Math.floor(rand() * samples.length)];
      const model = rand() < 0.78 ? MODELS[0] : MODELS[1];
      const r = rand();
      const rating = quality === 'bad' ? (r < 0.4 ? 'down' : null) : r < 0.32 ? 'up' : r < 0.335 ? 'down' : null;
      entries.push({
        id: `CH-${key}-${i}`,
        messageId: null,
        time: atHour(key, pickHour(rand) + rand()).toISOString(),
        userId: user.id,
        userName: user.name,
        unit: user.unit,
        question,
        answer,
        model,
        inputTokens: Math.round(850 + rand() * 500),
        outputTokens: Math.round(answer.length / 4 + rand() * 120),
        rating,
      });
    }
    entries
      .filter((e) => !until || new Date(e.time) <= until)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((e) => addEntry(day, e));
  }
  if (!until) cache.set(key, day);
  return day;
}

export function createChatState(now = new Date()) {
  return { today: chatDay(dateKey(now), now), adminLastLogin: null, updatedAt: now.toISOString() };
}

function today(state, now = new Date()) {
  const key = dateKey(now);
  if (state.today.date !== key) state.today = emptyDay(key);
  return state.today;
}

/** Catat satu pertanyaan dari dashboard beserta jawaban dan pemakaian tokennya. */
export function recordQuestion(state, { model, inputTokens, outputTokens, messageId = null, question = '', answer = '' }, now = new Date()) {
  addEntry(today(state, now), {
    id: `CH-${now.getTime()}`,
    messageId,
    time: now.toISOString(),
    userId: CURRENT_USER.id,
    userName: CURRENT_USER.name,
    unit: CURRENT_USER.unit,
    question,
    answer,
    model,
    inputTokens,
    outputTokens,
    rating: null,
  });
  state.adminLastLogin = now.toISOString();
  state.updatedAt = now.toISOString();
}

/**
 * Penilaian jawaban. rating: 'up' (Sesuai) | 'down' (Tidak sesuai) | null (batalkan).
 * Di mode simulasi hanya jawaban hari ini yang tercatat ulang.
 */
export function recordFeedback(state, { messageId, rating }, now = new Date()) {
  const day = today(state, now);
  const entry = day.entries.find((e) => e.messageId === messageId);
  if (entry) {
    const u = day.users[entry.userId];
    if (entry.rating) u[entry.rating] = Math.max(0, u[entry.rating] - 1);
    if (rating) u[rating] += 1;
    entry.rating = rating;
  }
  state.updatedAt = now.toISOString();
  return { ok: true };
}

const withoutEntries = ({ entries, ...rest }) => rest;

/**
 * Respons GET /chat/analytics untuk rentang { from, to } (kunci tanggal).
 * `rating` = 'down' menyaring riwayat chat ke jawaban yang dinilai Tidak sesuai.
 */
export function chatAnalytics(state, { from, to, rating = null }, now = new Date()) {
  const todayKey = dateKey(now);
  const dayFor = (k) => (k === todayKey ? today(state, now) : chatDay(k));
  const keys = [];
  for (let d = parseKey(from); dateKey(d) <= to; d.setDate(d.getDate() + 1)) keys.push(dateKey(d));
  const days = keys.map(dayFor);

  // Login terakhir: entri paling baru, dicari mundur dari hari ini.
  const lastLogin = new Map();
  if (state.adminLastLogin) lastLogin.set(CURRENT_USER.id, state.adminLastLogin);
  const d = parseKey(todayKey);
  for (let i = 0; i < LOOKBACK_DAYS && lastLogin.size < USERS.length + 1; i++, d.setDate(d.getDate() - 1)) {
    for (const e of [...dayFor(dateKey(d)).entries].reverse()) if (!lastLogin.has(e.userId)) lastLogin.set(e.userId, e.time);
  }
  const users = [CURRENT_USER, ...USERS].map(({ id, name, unit }) => ({ id, name, unit, lastLogin: lastLogin.get(id) ?? null }));

  const entries = days.flatMap((x) => x.entries).sort((a, b) => b.time.localeCompare(a.time));
  const down = entries.filter((e) => e.rating === 'down');
  const history = rating === 'down' ? down : entries;
  return { users, days: days.map(withoutEntries), history: history.slice(0, HISTORY_LIMIT), counts: { all: entries.length, down: down.length }, updatedAt: state.updatedAt };
}
