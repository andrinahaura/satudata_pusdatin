// Notifikasi peringatan lewat Telegram untuk mode simulasi. Bentuk objeknya = kontrak GET /notifications.
// Setiap peringatan baru dari getAlerts() dicatat sebagai pesan ke grup Telegram; peringatan yang
// hilang dicatat sebagai pesan "pulih". Backend asli cukup mengirim pesan lewat Telegram Bot API
// (sendMessage) dan menyimpan log yang sama.
import { DEVICE_TYPES } from './device-types.js';
import { outagesForDay } from './mock-history.js';
import { atHour, isWeekendKey, rngFor } from './mock-util.js';

const LIMIT = 120;

const SEVERITY_LABEL = { critical: 'Kritis', warning: 'Perhatian' };

export function createNotificationState() {
  return {
    channel: { type: 'telegram', bot: '@pusdatin_iot_bot', chat: 'Grup Teknisi Pusdatin', connected: true },
    settings: { enabled: true, critical: true, warning: true },
    active: {},
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

const shouldSend = (settings, severity) => settings.enabled && settings[severity] !== false;

function messageText(kind, alert) {
  if (kind === 'resolved') return `Pulih: ${alert.title}\n${alert.meta}`;
  return `[${SEVERITY_LABEL[alert.severity] ?? 'Info'}] ${alert.title}\n${alert.meta}`;
}

function push(state, kind, alert, time, sent) {
  state.items.unshift({
    id: `TG-${time.getTime()}-${Math.round(Math.random() * 1e6)}`,
    time: time.toISOString(),
    kind,
    alertId: alert.id,
    alertType: alert.type,
    severity: alert.severity,
    title: alert.title,
    meta: alert.meta,
    text: messageText(kind, alert),
    status: sent ? 'sent' : 'skipped',
  });
}

/**
 * Bandingkan peringatan sekarang dengan yang sudah diketahui, lalu catat pesan baru / pulih.
 * `seed` = true saat state pertama dibuat: peringatan awal dianggap terkirim beberapa menit lalu.
 */
export function syncNotifications(state, alerts, now = new Date(), { seed = false } = {}) {
  const current = new Map(alerts.map((a) => [a.id, a]));
  const fresh = alerts.filter((a) => !state.active[a.id]);
  fresh.forEach((a, i) => {
    const time = seed ? new Date(now.getTime() - (fresh.length - i) * 4 * 60000) : now;
    push(state, 'alert', a, time, shouldSend(state.settings, a.severity));
  });
  for (const [id, a] of Object.entries(state.active)) {
    if (!current.has(id)) push(state, 'resolved', a, now, shouldSend(state.settings, a.severity));
  }
  state.active = Object.fromEntries(alerts.map((a) => [a.id, { id: a.id, type: a.type, severity: a.severity, title: a.title, meta: a.meta }]));
  if (seed) state.items.sort((a, b) => b.time.localeCompare(a.time));
  state.items.length = Math.min(state.items.length, LIMIT);
  state.updatedAt = now.toISOString();
}

export function updateSettings(state, patch) {
  for (const key of ['enabled', 'critical', 'warning']) {
    if (typeof patch[key] === 'boolean') state.settings[key] = patch[key];
  }
  state.updatedAt = new Date().toISOString();
  return state.settings;
}

export function sendTest(state, now = new Date()) {
  state.items.unshift({
    id: `TG-${now.getTime()}-test`,
    time: now.toISOString(),
    kind: 'test',
    severity: null,
    title: 'Pesan uji',
    meta: `Dikirim dari dashboard ke ${state.channel.chat}`,
    text: 'Pesan uji dari dashboard SatuData Pusdatin.',
    status: state.channel.connected ? 'sent' : 'failed',
  });
  state.items.length = Math.min(state.items.length, LIMIT);
  return state.items[0];
}

/**
 * Log notifikasi hari yang sudah lewat, dibuat ulang dari gangguan koneksi hari itu
 * (pesan Kritis + pesan pulih) dan beberapa peringatan Perhatian di jam kerja.
 */
export function notificationsForDay(iot, key, until = null) {
  const rand = rngFor(`notif:${key}`);
  const rooms = new Map(iot.building.floors.flatMap((f) => f.rooms.map((r) => [r.id, { floor: f, room: r }])));
  const items = [];
  const item = (kind, time, alert, i) => ({
    id: `TG-${key}-${i}-${kind}`,
    time: time.toISOString(),
    kind,
    alertId: alert.id,
    alertType: alert.type,
    severity: alert.severity,
    title: alert.title,
    meta: alert.meta,
    text: messageText(kind, alert),
    status: 'sent',
  });
  outagesForDay(iot, key).forEach((o, i) => {
    const where = rooms.get(o.roomId);
    const alert = { id: `off-${o.deviceId}`, type: 'offline', severity: 'critical', title: `${DEVICE_TYPES[o.type].label} offline`, meta: `${where.floor.name} · ${where.room.name}` };
    items.push(item('alert', new Date(o.start), alert, i));
    if (o.end) items.push(item('resolved', new Date(o.end), alert, i));
  });
  if (!isWeekendKey(key)) {
    const workspaces = [...rooms.values()].filter((x) => x.room.equipped && x.room.type === 'office');
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const { floor, room } = workspaces[Math.floor(rand() * workspaces.length)];
      const energy = rand() < 0.4;
      const alert = energy
        ? { id: `energy-${floor.id}`, type: 'energy', severity: 'warning', title: 'Pemakaian listrik di atas target', meta: floor.name }
        : { id: `waste-${room.id}`, type: 'waste', severity: 'warning', title: 'Ruang kosong, perangkat menyala', meta: `${floor.name} · ${room.name}` };
      const start = atHour(key, 9 + rand() * 8);
      items.push(item('alert', start, alert, `w${i}`));
      items.push(item('resolved', new Date(start.getTime() + (10 + rand() * 50) * 60000), alert, `w${i}`));
    }
  }
  return items.filter((x) => !until || new Date(x.time) <= until).sort((a, b) => b.time.localeCompare(a.time));
}
