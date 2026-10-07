// Backend palsu yang berjalan di browser. Menyimpan state di sessionStorage
// supaya perubahan (mis. mematikan lampu) terlihat konsisten antar halaman.
import { estimateTokens } from '../data/chat-models.js';
import { DEVICE_TYPES } from '../data/device-types.js';
import { createIotState, createParkingState, logActivity, stepIot, stepParking } from '../data/mock.js';
import { createChatState, ensureToday, recordFeedback, recordQuestion } from '../data/mock-chat.js';
import { createHistoryState, recordChanges, simulateConnectivity, snapshotDevices } from '../data/mock-history.js';
import { createNotificationState, sendTest, syncNotifications, updateSettings } from '../data/mock-notifications.js';
import { answer } from './chat-engine.js';
import { getAlerts } from './selectors.js';

const STORAGE_KEY = 'sdp:mock-state:v4';
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

export async function getIotHistory() {
  await latency();
  return structuredClone(state.history);
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

export async function getNotifications() {
  await latency();
  return structuredClone(state.notifications);
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

export async function getChatAnalytics() {
  await latency();
  ensureToday(state.chat);
  return structuredClone(state.chat);
}

/* ------------------------------- realtime ------------------------------- */

export function subscribe(handler, interval) {
  listeners.add(handler);
  if (!timer) {
    timer = setInterval(() => {
      const before = snapshotDevices(state.iot);
      simulateConnectivity(state.iot);
      stepIot(state.iot, Math.random, interval / 1000);
      if (Math.random() < 0.7) stepParking(state.parking);
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
