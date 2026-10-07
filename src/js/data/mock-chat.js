// Analitik chatbot untuk mode simulasi. Bentuk objeknya = kontrak GET /chat/analytics.
//   users    : pengguna yang pernah memakai chatbot (login terakhir, jumlah pertanyaan, ulasan)
//   daily    : 30 hari terakhir, pertanyaan dan token per model
//   history  : riwayat chat semua pengguna (pertanyaan, jawaban, model, token, penilaian), terbaru di depan
// Pertanyaan dari dashboard ini dicatat atas nama pengguna yang sedang login (CURRENT_USER).
import { MODELS } from './chat-models.js';

const DAYS = 30;
const HISTORY_LIMIT = 80;

function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const pad2 = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Nama contoh (fiktif). Unit mengikuti pintas unit organisasi di chatbot.
const FIRST = ['Andi', 'Rina', 'Dimas', 'Sari', 'Budi', 'Putri', 'Fajar', 'Lestari', 'Agus', 'Wulan', 'Hendra', 'Maya', 'Rizky', 'Nadia', 'Yoga', 'Intan', 'Arif', 'Dewi', 'Bayu', 'Citra', 'Eko', 'Fitri'];
const LAST = ['Pratama', 'Wijaya', 'Saputra', 'Lestari', 'Nugroho', 'Hidayat', 'Kusuma', 'Permana', 'Santoso', 'Rahayu', 'Setiawan'];
const USER_UNITS = ['Pusdatin', 'Pusdatin', 'Pusdatin', 'Sekjen', 'SDA', 'Bina Marga', 'Cipta Karya', 'Prasarana Strategis', 'Pembiayaan', 'BPSDM'];

export const CURRENT_USER = { id: 'U-ADMIN', name: 'Admin Pusdatin', unit: 'Pusdatin' };

// Contoh riwayat chat. rating: 'up' (Sesuai) | 'down' (Tidak sesuai) | null (belum dinilai).
const SAMPLE_BUILDING = [
  ['Lampu yang belum mati di lantai 1?', 'Ada 9 lampu yang masih menyala di Lantai 1, tersebar di 4 ruangan. Terbanyak di Lobby (3 lampu).', 'up'],
  ['Berapa slot parkir yang kosong?', 'Tersedia 18 slot parkir kosong dari 112 slot. Area A sisa 4, Area B sisa 8, Area Motor sisa 6.', 'up'],
  ['Pemakaian listrik hari ini?', 'Pemakaian listrik seluruh gedung hari ini 104,2 kWh (Rp 179.953), turun 12% dibanding kemarin pada jam yang sama.', 'up'],
  ['Perangkat mana yang offline?', 'Ada 3 perangkat offline: Lampu 1 di 22 R. Katim, AC 1 di 09 R. Tim Jaringan, dan sensor kehadiran di Mushola.', 'up'],
  ['Ruang kosong tapi AC masih menyala?', 'Workspace Lt 2 kosong tetapi 2 AC dan 4 lampu masih menyala, sekitar 1,8 kW terbuang.', null],
  ['Jadwal pemeliharaan genset bulan ini?', 'Maaf, saya belum memahami pertanyaan itu. Coba tanyakan soal lampu, AC, suhu, listrik, perangkat offline, atau parkir.', 'down'],
  ['Berapa sisa anggaran listrik tahun ini?', 'Pemakaian listrik bulan ini 2.840 kWh (Rp 4.904.680). Data anggaran tahunan belum tersedia di chatbot.', 'down'],
];
const SAMPLE_DOCUMENT = [
  ['Siapa yang menandatangani nota dinas?', 'Nota dinas ditandatangani pejabat paling rendah setingkat eselon III dan ditujukan kepada pejabat setingkat atau satu tingkat di atasnya. [1]', 'up'],
  ['Kapan pemeliharaan rutin saluran irigasi tersier?', 'Pemeliharaan rutin dilakukan setiap awal musim tanam: pembersihan sedimen, perbaikan tanggul kecil, dan pengecekan pintu air. [1]', 'up'],
  ['Kejadian bencana yang masih tanggap darurat?', 'Data SITABA mencatat 2 kejadian yang masih tanggap darurat: banjir di Kab. Bekasi dan tanah longsor di Kab. Bogor.', 'up'],
  ['Berapa jam pelajaran pengembangan kompetensi per tahun?', 'Setiap pegawai mengikuti pengembangan kompetensi paling sedikit 20 jam pelajaran dalam satu tahun. [1]', null],
  ['Prosedur peminjaman mobil dinas?', 'Saya tidak menemukan dokumen yang membahas peminjaman mobil dinas. Coba gunakan kata kunci lain, atau lampirkan dokumennya.', 'down'],
];

function emptyDay(date) {
  return { date, questions: 0, activeUsers: 0, inputTokens: 0, outputTokens: 0, byModel: Object.fromEntries(MODELS.map((m) => [m, { questions: 0, inputTokens: 0, outputTokens: 0 }])) };
}

export function createChatState(now = new Date(), seed = 5521) {
  const rand = createRng(seed);
  const users = Array.from({ length: 26 }, (_, i) => {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const daysAgo = Math.floor(rand() ** 2 * 20);
    const lastLogin = new Date(now.getTime() - daysAgo * 86400000 - Math.floor(rand() * 8 * 3600000));
    const questions = 3 + Math.floor(rand() * 60);
    const up = Math.floor(questions * (0.25 + rand() * 0.3));
    const down = Math.floor(questions * rand() * 0.08);
    return { id: `U-${pad2(i + 1)}`, name, unit: USER_UNITS[Math.floor(rand() * USER_UNITS.length)], lastLogin: lastLogin.toISOString(), questions, ratings: { up, down } };
  });
  users.unshift({ ...CURRENT_USER, lastLogin: now.toISOString(), questions: 0, ratings: { up: 0, down: 0 } });

  const daily = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (DAYS - 1 - i));
    const day = emptyDay(localDate(d));
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const isToday = i === DAYS - 1;
    // Pemakaian naik pelan sejak chatbot diluncurkan; akhir pekan sepi; hari ini baru berjalan.
    const base = (weekend ? 6 : 24 + i * 0.9) * (0.8 + rand() * 0.4) * (isToday ? Math.min(1, now.getHours() / 17) : 1);
    for (const model of MODELS) {
      const share = model === MODELS[0] ? 0.78 : 0.22;
      const q = Math.round(base * share);
      const m = day.byModel[model];
      m.questions = q;
      m.inputTokens = Math.round(q * (850 + rand() * 500));
      m.outputTokens = Math.round(q * (260 + rand() * 160));
    }
    day.questions = MODELS.reduce((s, m) => s + day.byModel[m].questions, 0);
    day.inputTokens = MODELS.reduce((s, m) => s + day.byModel[m].inputTokens, 0);
    day.outputTokens = MODELS.reduce((s, m) => s + day.byModel[m].outputTokens, 0);
    day.activeUsers = Math.min(users.length, Math.max(day.questions ? 1 : 0, Math.round(day.questions / (2.4 + rand()))));
    return day;
  });

  // Riwayat chat contoh: 30 percakapan terakhir dari pengguna lain, makin lama makin jarang.
  const history = Array.from({ length: 30 }, (_, i) => {
    const user = users[1 + Math.floor(rand() * (users.length - 1))];
    const pool = user.unit === 'Pusdatin' ? SAMPLE_BUILDING : SAMPLE_DOCUMENT;
    const [question, answer, rating] = pool[Math.floor(rand() * pool.length)];
    const model = rand() < 0.78 ? MODELS[0] : MODELS[1];
    const inputTokens = Math.round(850 + rand() * 500);
    const outputTokens = Math.round(answer.length / 4);
    const time = new Date(now.getTime() - (i * 1.6 + rand()) * 3600000);
    return { id: `CH-seed-${i}`, messageId: null, time: time.toISOString(), userId: user.id, userName: user.name, unit: user.unit, question, answer, model, inputTokens, outputTokens, rating };
  });

  return { users, daily, history, updatedAt: now.toISOString() };
}

function today(state, now = new Date()) {
  const key = localDate(now);
  let day = state.daily[state.daily.length - 1];
  if (day?.date !== key) {
    day = emptyDay(key);
    state.daily.push(day);
    state.daily = state.daily.slice(-DAYS);
  }
  return day;
}

const currentUser = (state) => state.users.find((u) => u.id === CURRENT_USER.id);

/** Catat satu pertanyaan beserta jawaban dan pemakaian tokennya. */
export function recordQuestion(state, { model, inputTokens, outputTokens, messageId = null, question = '', answer = '' }, now = new Date()) {
  const day = today(state, now);
  const m = day.byModel[model] ?? (day.byModel[model] = { questions: 0, inputTokens: 0, outputTokens: 0 });
  m.questions += 1;
  m.inputTokens += inputTokens;
  m.outputTokens += outputTokens;
  day.questions += 1;
  day.inputTokens += inputTokens;
  day.outputTokens += outputTokens;
  const user = currentUser(state);
  if (user.questions === 0 || new Date(user.lastLogin).toDateString() !== now.toDateString()) day.activeUsers += 1;
  user.questions += 1;
  user.lastLogin = now.toISOString();
  state.history.unshift({ id: `CH-${now.getTime()}`, messageId, time: now.toISOString(), userId: user.id, userName: user.name, unit: user.unit, question, answer, model, inputTokens, outputTokens, rating: null });
  state.history.length = Math.min(state.history.length, HISTORY_LIMIT);
  state.updatedAt = now.toISOString();
}

/**
 * Penilaian jawaban. rating: 'up' (Sesuai) | 'down' (Tidak sesuai) | null (batalkan).
 * `previous` = penilaian sebelumnya untuk jawaban yang sama, supaya hitungan tidak dobel.
 */
export function recordFeedback(state, { messageId, rating, previous = null }, now = new Date()) {
  const user = currentUser(state);
  if (previous) user.ratings[previous] = Math.max(0, user.ratings[previous] - 1);
  if (rating) user.ratings[rating] += 1;
  const entry = state.history.find((h) => h.messageId === messageId);
  if (entry) entry.rating = rating;
  state.updatedAt = now.toISOString();
  return { ok: true };
}

export function ensureToday(state, now = new Date()) {
  today(state, now);
}
