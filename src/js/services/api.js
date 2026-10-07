// Satu-satunya pintu akses data. Halaman tidak pernah fetch langsung,
// jadi pindah dari mock ke backend asli cukup lewat .env (VITE_USE_MOCK=false).
import { config } from '../config.js';
import * as mock from './mock-backend.js';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`${method} ${path} gagal: HTTP ${res.status}`);
  return res.json();
}

// { from: '2026-10-01', to: '2026-10-07', status: 'all' } -> '?from=2026-10-01&to=2026-10-07&status=all'
const qs = (params) => `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()}`;

export const api = {
  /** @returns {Promise<{building, devices, updatedAt}>} */
  getIot: () => (config.useMock ? mock.getIot() : request('/iot')),

  /** Kondisi parkir saat ini. @returns {Promise<{zones, cameras, events, visits, history, today, updatedAt}>} */
  getParking: () => (config.useMock ? mock.getParking() : request('/parking')),

  /** Ubah status on/off banyak perangkat sekaligus. @returns {Promise<{updated:number}>} */
  setDevices: (ids, on) => (config.useMock ? mock.setDevices(ids, on) : request('/iot/devices', { method: 'PATCH', body: { ids, on } })),

  // Endpoint berentang waktu menerima `q` = { from, to } (kunci tanggal 'YYYY-MM-DD', inklusif),
  // biasanya dari rangeQuery(range) di utils/range.js.

  /** Riwayat status (aktif/tidak aktif) dan konektivitas perangkat. @returns {Promise<{statusLog, statusTotal, outages, updatedAt}>} */
  getIotHistory: (q) => (config.useMock ? mock.getIotHistory(q) : request(`/iot/history${qs(q)}`)),

  /** Pemakaian listrik per jam per lantai untuk setiap hari. @returns {Promise<{tariff, days: {[date]: {[floorId]: number[]}}, target}>} */
  getEnergyHistory: (q) => (config.useMock ? mock.getEnergyHistory(q) : request(`/iot/energy${qs(q)}`)),

  /** Kanal Telegram, pengaturan, dan log notifikasi peringatan di rentang. @returns {Promise<{channel, settings, items, updatedAt}>} */
  getNotifications: (q) => (config.useMock ? mock.getNotifications(q) : request(`/notifications${qs(q)}`)),

  /** Okupansi per jam, masuk/keluar, dan lama parkir per hari. @returns {Promise<{days: {date, hourly, in, out, avgDurationMin}[]}>} */
  getParkingStats: (q) => (config.useMock ? mock.getParkingStats(q) : request(`/parking/stats${qs(q)}`)),

  /** q: { from, to, status?: 'all'|'inside'|'out', q?: nomor polisi, limit? } @returns {Promise<{items, counts: {all, inside, out}}>} */
  getParkingVisits: (q) => (config.useMock ? mock.getParkingVisits(q) : request(`/parking/visits${qs(q)}`)),

  /** patch: { enabled?, critical?, warning? } @returns {Promise<{enabled, critical, warning}>} */
  updateNotificationSettings: (patch) =>
    config.useMock ? mock.updateNotificationSettings(patch) : request('/notifications/settings', { method: 'PATCH', body: patch }),

  /** Kirim pesan uji ke grup Telegram. @returns {Promise<object>} item log yang baru */
  sendTestNotification: () => (config.useMock ? mock.sendTestNotification() : request('/notifications/test', { method: 'POST' })),

  /**
   * meta: { unit, model, attachment: { name, size, type, text? } } dari composer chatbot.
   * @returns {Promise<{text, items?, actions?, suggestions?, link?, citations?, chart?, model, usage}>}
   */
  ask: (message, history = [], meta = {}) =>
    config.useMock ? mock.ask(message, history, meta) : request('/chat', { method: 'POST', body: { message, history, ...meta } }),

  /** Penilaian jawaban. payload: { messageId, rating: 'up'|'down'|null, previous, model, question, answer } */
  rateAnswer: (payload) => (config.useMock ? mock.rateAnswer(payload) : request('/chat/feedback', { method: 'POST', body: payload })),

  /** q: { from, to, rating?: 'down' }. Pengguna, pemakaian per hari, dan riwayat chat di rentang. @returns {Promise<{users, days, history, counts: {all, down}, updatedAt}>} */
  getChatAnalytics: (q) => (config.useMock ? mock.getChatAnalytics(q) : request(`/chat/analytics${qs(q)}`)),

  /**
   * Update realtime. handler menerima { iot?, parking? }.
   * Mock: simulasi interval. Backend: WebSocket bila VITE_WS_URL diisi, selain itu polling.
   * @returns {() => void} unsubscribe
   */
  subscribe(handler) {
    if (config.useMock) return mock.subscribe(handler, config.pollInterval);

    if (config.wsUrl) {
      let ws;
      let closed = false;
      let retry;
      const connect = () => {
        ws = new WebSocket(config.wsUrl);
        ws.onmessage = (e) => {
          try {
            handler(JSON.parse(e.data));
          } catch (err) {
            console.warn('[realtime] payload tidak valid', err);
          }
        };
        ws.onclose = () => {
          if (!closed) retry = setTimeout(connect, 3000);
        };
      };
      connect();
      return () => {
        closed = true;
        clearTimeout(retry);
        ws?.close();
      };
    }

    const poll = async () => {
      try {
        const [iot, parking] = await Promise.all([api.getIot(), api.getParking()]);
        handler({ iot, parking });
      } catch (err) {
        console.warn('[realtime] polling gagal', err);
      }
    };
    const id = setInterval(poll, config.pollInterval);
    return () => clearInterval(id);
  },
};

// Event global agar komponen lain (denah, KPI) ikut refresh setelah ada aksi.
export const DEVICES_CHANGED = 'sdp:devices-changed';
