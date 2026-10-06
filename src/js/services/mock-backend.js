// Backend palsu yang berjalan di browser. Menyimpan state di sessionStorage
// supaya perubahan (mis. mematikan lampu) terlihat konsisten antar halaman.
import { DEVICE_TYPES } from '../data/device-types.js';
import { createIotState, createParkingState, logActivity, stepIot, stepParking } from '../data/mock.js';
import { answer } from './chat-engine.js';

const STORAGE_KEY = 'sdp:mock-state:v2';
const listeners = new Set();
let timer = null;

const state = load() ?? { iot: createIotState(), parking: createParkingState() };

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

const snapshot = () => structuredClone(state);
const latency = (ms = 150) => new Promise((r) => setTimeout(r, ms));

function emit() {
  const snap = snapshot();
  listeners.forEach((fn) => fn(snap));
}

export async function getIot() {
  await latency();
  return structuredClone(state.iot);
}

export async function getParking() {
  await latency();
  return structuredClone(state.parking);
}

export async function setDevices(ids, on) {
  await latency(250);
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
  save();
  emit();
  return { updated };
}

export async function ask(message, meta) {
  await latency(500 + Math.random() * 400);
  return answer(message, state, meta);
}

export function subscribe(handler, interval) {
  listeners.add(handler);
  if (!timer) {
    timer = setInterval(() => {
      stepIot(state.iot, Math.random, interval / 1000);
      if (Math.random() < 0.7) stepParking(state.parking);
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
