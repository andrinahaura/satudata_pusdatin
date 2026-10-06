// Penyimpanan percakapan chatbot (banyak percakapan, seperti TEJAS Chatbot PU).
// Disimpan di localStorage per browser; dipakai bersama oleh halaman Chatbot dan widget Home.
// Saat backend siap, fungsi-fungsi ini bisa diganti panggilan API riwayat percakapan.

const KEY = 'sdp:chats:v1';
const LIMIT = 50;
export const CHATS_CHANGED = 'sdp:chats-changed';

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.conversations)) return data;
  } catch {
    /* storage diblokir / rusak: mulai kosong */
  }
  return { activeId: null, conversations: [] };
}

let data = read();

function write() {
  data.conversations = data.conversations.slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* tetap jalan di memori */
  }
  window.dispatchEvent(new CustomEvent(CHATS_CHANGED));
}

// Sinkron antar tab.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  data = read();
  window.dispatchEvent(new CustomEvent(CHATS_CHANGED));
});

/** Percakapan terbaru di depan. */
export const listConversations = () => [...data.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const getConversation = (id) => data.conversations.find((c) => c.id === id) ?? null;

export function activeConversation() {
  return getConversation(data.activeId);
}

/** Percakapan aktif belum dibuat sampai pesan pertama dikirim (layar awal kosong). */
export function startNewConversation() {
  data.activeId = null;
  write();
}

export function setActiveConversation(id) {
  data.activeId = getConversation(id) ? id : null;
  write();
}

export function createConversation({ unit = 'pusdatin', model } = {}) {
  const now = new Date().toISOString();
  const conv = { id: `c${Date.now().toString(36)}`, title: 'Percakapan baru', unit, model, createdAt: now, updatedAt: now, messages: [] };
  data.conversations.unshift(conv);
  data.activeId = conv.id;
  write();
  return conv;
}

/** Simpan perubahan percakapan (pesan baru, unit, model). Judul diambil dari pertanyaan pertama. */
export function saveConversation(conv) {
  const first = conv.messages.find((m) => m.role === 'user');
  if (first) conv.title = first.text.length > 60 ? `${first.text.slice(0, 57).trim()}…` : first.text;
  conv.messages = conv.messages.slice(-80);
  conv.updatedAt = new Date().toISOString();
  write();
}

export function deleteConversation(id) {
  data.conversations = data.conversations.filter((c) => c.id !== id);
  if (data.activeId === id) data.activeId = null;
  write();
}
