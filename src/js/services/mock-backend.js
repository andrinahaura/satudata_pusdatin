// Backend palsu yang berjalan di browser. Menyimpan state di sessionStorage
// supaya perubahan (mis. mematikan lampu) terlihat konsisten antar halaman.
// Endpoint berentang waktu menerima { from, to } (kunci tanggal 'YYYY-MM-DD', inklusif):
// hari ini diambil dari state (realtime), hari-hari lalu dibuat ulang oleh generator per tanggal.
import { estimateTokens } from '../data/chat-models.js';
import { DEVICE_TYPES } from '../data/device-types.js';
import {
  createIotState, createParkingState, energyDayHourly, logActivity, parkingDayVisits, parkingStatsFromVisits, stepIot, stepParking,
} from '../data/mock.js';
import { chatAnalytics, createChatState, recordFeedback, recordQuestion } from '../data/mock-chat.js';
import { createHistoryState, outagesForDay, recordChanges, simulateConnectivity, snapshotDevices, statusForDay } from '../data/mock-history.js';
import { createNotificationState, notificationsForDay, sendTest, syncNotifications, updateSettings } from '../data/mock-notifications.js';
import { dateKey, keysBetween, parseKey, startOfDay } from '../utils/range.js';
import { answer } from './chat-engine.js';
import { getAlerts } from './selectors.js';

const STORAGE_KEY = 'sdp:mock-state:v7';
const STATUS_RESPONSE_LIMIT = 1000;
const listeners = new Set();
let timer = null;

const state = load() ?? createState();

function createState() {
  const iot = createIotState();
  const parking = createParkingState();
  const notifications = createNotificationState();
  syncNotifications(notifications, getAlerts(iot, parking), new Date(), { seed: true });
  return { iot, parking, history: createHistoryState(iot), notifications, chat: createChatState() };
}

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage penuh / diblokir: state tetap jalan di memori */
  }
}

const latency = (ms = 150) => new Promise((r) => setTimeout(r, ms));

// Kunci tanggal di rentang, plus penanda hari ini dan awal hari ini.
function rangeDays({ from, to }) {
  const now = new Date();
  const today = dateKey(now);
  const keys = keysBetween(parseKey(from), parseKey(to)).filter((k) => k <= today);
  return { keys, today, midnight: startOfDay(now).getTime(), now };
}

function emit() {
  const snap = { iot: structuredClone(state.iot), parking: structuredClone(state.parking) };
  listeners.forEach((fn) => fn(snap));
}

// Setelah data berubah: catat riwayat perangkat dan kirim notifikasi peringatan yang baru.
function afterChange(before) {
  const now = new Date();
  recordChanges(state.history, state.iot, before, now);
  syncNotifications(state.notifications, getAlerts(state.iot, state.parking), now);
}

export async function getIot() {
  await latency();
  return structuredClone(state.iot);
}

export async function getParking() {
  await latency();
  return structuredClone(state.parking);
}

/** GET /iot/history?from=&to= */
export async function getIotHistory(range) {
  await latency();
  const { keys, today, midnight } = rangeDays(range);
  const statusLog = [];
  const outages = [];
  for (const k of keys) {
    if (k === today) {
      statusLog.push(...state.history.statusLog);
      outages.push(...state.history.outages.filter((o) => !o.end || new Date(o.end).getTime() >= midnight));
    } else {
      statusLog.push(...statusForDay(state.iot, k));
      outages.push(...outagesForDay(state.iot, k));
    }
  }
  statusLog.sort((a, b) => b.time.localeCompare(a.time));
  outages.sort((a, b) => b.start.localeCompare(a.start));
  return structuredClone({ from: range.from, to: range.to, statusLog: statusLog.slice(0, STATUS_RESPONSE_LIMIT), statusTotal: statusLog.length, outages, updatedAt: state.history.updatedAt });
}

/** GET /iot/energy?from=&to= — pemakaian per jam per lantai untuk setiap hari di rentang. */
export async function getEnergyHistory(range) {
  await latency();
  const { keys, today } = rangeDays(range);
  const { energy } = state.iot;
  const days = {};
  for (const k of keys) {
    days[k] = Object.fromEntries(Object.entries(energy.floors).map(([id, f]) => [id, k === today ? f.today : energyDayHourly(id, f.peakKw, k)]));
  }
  const target = Object.fromEntries(Object.entries(energy.floors).map(([id, f]) => [id, f.target]));
  return structuredClone({ from: range.from, to: range.to, tariff: energy.tariff, days, target, updatedAt: energy.updatedAt });
}

export async function setDevices(ids, on) {
  await latency(250);
  const before = snapshotDevices(state.iot);
  const wanted = new Set(ids);
  let updated = 0;
  for (const d of state.iot.devices) {
    if (wanted.has(d.id) && d.online && d.on !== on && DEVICE_TYPES[d.type].controllable) {
      d.on = on;
      updated += 1;
      logActivity(state.iot, d.roomId, `${d.name} ${on ? 'dinyalakan' : 'dimatikan'} dari dashboard`);
    }
  }
  state.iot.updatedAt = new Date().toISOString();
  afterChange(before);
  save();
  emit();
  return { updated };
}

/* ------------------------------ notifikasi ------------------------------ */

/** GET /notifications?from=&to= */
export async function getNotifications(range) {
  await latency();
  const { keys, today, midnight } = rangeDays(range);
  const items = keys.flatMap((k) => (k === today ? state.notifications.items.filter((i) => new Date(i.time).getTime() >= midnight) : notificationsForDay(state.iot, k)));
  items.sort((a, b) => b.time.localeCompare(a.time));
  const { channel, settings, updatedAt } = state.notifications;
  return structuredClone({ channel, settings, items, updatedAt });
}

export async function updateNotificationSettings(patch) {
  await latency(200);
  const settings = updateSettings(state.notifications, patch);
  save();
  return structuredClone(settings);
}

export async function sendTestNotification() {
  await latency(400);
  const item = sendTest(state.notifications);
  save();
  return structuredClone(item);
}

/* -------------------------------- chatbot -------------------------------- */

export async function ask(message, history, meta) {
  await latency(500 + Math.random() * 400);
  const res = answer(message, state, meta);
  const model = meta.model;
  // Token masuk = pertanyaan + riwayat + isi lampiran yang ikut dikirim ke model.
  const context = history.map((m) => m.text).join('\n') + (meta.attachment?.text ?? '');
  const usage = {
    inputTokens: 420 + estimateTokens(message) + estimateTokens(context),
    outputTokens: estimateTokens(`${res.text}${(res.items ?? []).map((i) => `${i.title} ${i.meta}`).join(' ')}${(res.citations ?? []).map((c) => c.snippet).join(' ')}`),
  };
  recordQuestion(state.chat, { model, ...usage, messageId: meta.messageId ?? null, question: message, answer: res.text });
  save();
  return { ...res, model, usage };
}

export async function rateAnswer(payload) {
  await latency(150);
  const res = recordFeedback(state.chat, payload);
  save();
  return res;
}

/** GET /chat/analytics?from=&to= */
export async function getChatAnalytics(range) {
  await latency();
  const res = chatAnalytics(state.chat, range);
  save();
  return structuredClone(res);
}

/* --------------------------------- parkir --------------------------------- */

function todayParkingStats(now) {
  const { parking } = state;
  const hour = now.getHours();
  const done = parking.visits.filter((v) => v.outAt && new Date(v.outAt) >= startOfDay(now));
  const minutes = done.reduce((s, v) => s + (new Date(v.outAt) - new Date(v.inAt)) / 60000, 0);
  return {
    date: dateKey(now),
    hourly: parking.history.map((h) => ({ hour: h.hour, occupancy: Number(h.hour.slice(0, 2)) <= hour ? h.occupancy : null })),
    in: { ...parking.today.in },
    out: { ...parking.today.out },
    avgDurationMin: done.length ? minutes / done.length : 0,
  };
}

/** GET /parking/stats?from=&to= — okupansi per jam, jumlah masuk/keluar, dan lama parkir per hari. */
export async function getParkingStats(range) {
  await latency();
  const { keys, today, now } = rangeDays(range);
  const days = keys.map((k) => (k === today ? todayParkingStats(now) : parkingStatsFromVisits(k, parkingDayVisits(k))));
  return structuredClone({ from: range.from, to: range.to, days });
}

/**
 * GET /parking/visits?from=&to=&status=&q=&limit=
 * status: 'all' | 'inside' | 'out'. q: potongan nomor polisi. Terbaru di depan.
 */
export async function getParkingVisits({ from, to, status = 'all', q = '', limit = 120 }) {
  await latency();
  const { keys, today, midnight } = rangeDays({ from, to });
  const all = keys.flatMap((k) =>
    k === today ? state.parking.visits.filter((v) => !v.outAt || new Date(v.inAt).getTime() >= midnight || new Date(v.outAt).getTime() >= midnight) : parkingDayVisits(k),
  );
  const needle = q.replace(/\s+/g, '').toLowerCase();
  const matches = all.filter((v) => !needle || v.plate.replace(/\s+/g, '').toLowerCase().includes(needle));
  const counts = { all: matches.length, inside: matches.filter((v) => !v.outAt).length, out: matches.filter((v) => v.outAt).length };
  const items = matches
    .filter((v) => status === 'all' || (status === 'inside' ? !v.outAt : v.outAt))
    .sort((a, b) => (b.outAt ?? b.inAt).localeCompare(a.outAt ?? a.inAt))
    .slice(0, limit);
  return structuredClone({ items, counts });
}

/* ------------------------------- realtime ------------------------------- */

export function subscribe(handler, interval) {
  listeners.add(handler);
  if (!timer) {
    timer = setInterval(() => {
      const before = snapshotDevices(state.iot);
      simulateConnectivity(state.iot);
      stepIot(state.iot, Math.random, interval / 1000);
      // 24 slot: rata-rata satu kendaraan masuk/keluar tiap ± 1 menit.
      if (Math.random() < 0.08) stepParking(state.parking);
      afterChange(before);
      save();
      emit();
    }, interval);
  }
  return () => {
    listeners.delete(handler);
    if (!listeners.size) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function reset() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* abaikan */
  }
}
