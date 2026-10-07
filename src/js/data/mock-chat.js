// Analitik chatbot untuk mode simulasi. Bentuk objeknya = kontrak GET /chat/analytics.
//   users    : pengguna yang pernah memakai chatbot (login terakhir, jumlah pertanyaan, ulasan)
//   daily    : 30 hari terakhir, pertanyaan dan token per model
//   feedback : penilaian jawaban (Sesuai / Tidak sesuai), terbaru di depan
// Pertanyaan dari dashboard ini dicatat atas nama pengguna yang sedang login (CURRENT_USER).
import { MODELS } from './chat-models.js';

const DAYS = 30;
const FEEDBACK_LIMIT = 60;

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

const SAMPLE_DOWN = [
  ['Jadwal pemeliharaan genset bulan ini?', 'Jawaban tidak menyebut tanggal pemeliharaan.'],
  ['Berapa sisa anggaran listrik tahun ini?', 'Data anggaran belum tersedia di chatbot.'],
  ['Prosedur peminjaman mobil dinas?', 'Rujukan dokumen kurang lengkap.'],
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

  const feedback = SAMPLE_DOWN.map(([question, note], i) => ({
    id: `FB-seed-${i}`,
    time: new Date(now.getTime() - (i + 1) * 26 * 3600000).toISOString(),
    userId: users[2 + i * 3].id,
    userName: users[2 + i * 3].name,
    model: MODELS[i % MODELS.length],
    question,
    note,
    rating: 'down',
  }));

  return { users, daily, feedback, updatedAt: now.toISOString() };
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

/** Catat satu pertanyaan beserta pemakaian tokennya. */
export function recordQuestion(state, { model, inputTokens, outputTokens }, now = new Date()) {
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
  state.updatedAt = now.toISOString();
}

/**
 * Penilaian jawaban. rating: 'up' (Sesuai) | 'down' (Tidak sesuai) | null (batalkan).
 * `previous` = penilaian sebelumnya untuk jawaban yang sama, supaya hitungan tidak dobel.
 */
export function recordFeedback(state, { messageId, rating, previous = null, model, question = '', answer = '' }, now = new Date()) {
  const user = currentUser(state);
  if (previous) user.ratings[previous] = Math.max(0, user.ratings[previous] - 1);
  if (rating) user.ratings[rating] += 1;
  state.feedback = state.feedback.filter((f) => f.messageId !== messageId);
  if (rating) {
    state.feedback.unshift({ id: `FB-${now.getTime()}`, messageId, time: now.toISOString(), userId: user.id, userName: user.name, model, question, answer: answer.slice(0, 160), rating });
  }
  state.feedback.length = Math.min(state.feedback.length, FEEDBACK_LIMIT);
  state.updatedAt = now.toISOString();
  return { ok: true };
}

export function ensureToday(state, now = new Date()) {
  today(state, now);
}
