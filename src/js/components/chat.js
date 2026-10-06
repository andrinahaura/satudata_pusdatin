// Komponen chat AI, dipakai di widget Home dan halaman Chatbot.
// Riwayat disimpan di sessionStorage sehingga percakapan berlanjut antar halaman.
import { api, DEVICES_CHANGED } from '../services/api.js';
import { DEFAULT_SUGGESTIONS } from '../services/chat-engine.js';
import { esc } from '../utils/dom.js';
import { fmtTime } from '../utils/format.js';
import { icon, renderIcons } from './icons.js';

const STORAGE_KEY = 'sdp:chat:v1';
const WELCOME = {
  role: 'assistant',
  text: 'Tanyakan kondisi gedung: lampu, AC, suhu, listrik, perangkat bermasalah, atau parkir.',
  suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
};

function loadHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
  } catch {
    /* abaikan */
  }
}

function assistantHtml(m, index) {
  const items = m.items?.length
    ? `<ul class="mt-2 divide-y divide-hairline overflow-hidden rounded-nested border border-hairline bg-paper">
        ${m.items.map((it) => `<li class="flex items-baseline justify-between gap-3 px-3 py-2"><span class="min-w-0 truncate">${esc(it.title)}</span><span class="shrink-0 text-right text-caption tracking-normal text-mid-gray">${esc(it.meta ?? '')}</span></li>`).join('')}
      </ul>`
    : '';
  const actions = m.actions?.length && !m.resolved
    ? `<div class="mt-3 flex flex-wrap gap-2">${m.actions.map((a, ai) => `<button type="button" class="btn btn-sm ${a.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}" data-msg="${index}" data-action="${ai}">${esc(a.label)}</button>`).join('')}</div>`
    : '';
  const resolved = m.resolved ? `<p class="mt-2 text-caption tracking-normal text-mid-gray">${esc(m.resolved)}</p>` : '';
  const link = m.link ? `<a href="${esc(m.link.href)}" class="mt-2 inline-block text-[13px] font-medium underline underline-offset-4">${esc(m.link.label)} →</a>` : '';
  return `<div class="flex">
    <div class="min-w-0 max-w-[85%]">
      <div class="rounded-[18px] rounded-tl-small bg-canvas px-3.5 py-2.5">
        <p class="whitespace-pre-line">${esc(m.text)}</p>
        ${items}${actions}${resolved}${link}
      </div>
      ${m.time ? `<p class="mt-1 text-caption tracking-normal text-mid-gray">${fmtTime(m.time)}</p>` : ''}
    </div>
  </div>`;
}

function userHtml(m) {
  return `<div class="flex justify-end">
    <div class="max-w-[85%] rounded-[18px] rounded-tr-small bg-ink px-3.5 py-2.5 text-surface-alt">
      <p class="whitespace-pre-line">${esc(m.text)}</p>
    </div>
  </div>`;
}

const typingHtml = `<div class="flex" data-typing><div class="typing flex items-center gap-1 rounded-[18px] rounded-tl-small bg-canvas px-4 py-3">${'<span class="size-1.5 rounded-full bg-mid-gray"></span>'.repeat(3)}</div></div>`;

/**
 * @param {HTMLElement} root
 * @param {{ placeholder?: string, autoFocus?: boolean }} [opts]
 */
export function createChat(root, opts = {}) {
  root.innerHTML = `
    <div class="flex h-full min-h-0 flex-col">
      <div data-chat-log class="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite"></div>
      <div data-chat-suggest class="scroll-thin flex gap-2 overflow-x-auto px-5 pb-3"></div>
      <form data-chat-form class="flex items-center gap-2 border-t border-hairline p-3">
        <label class="sr-only" for="chat-input-${root.id || 'x'}">Pertanyaan</label>
        <input id="chat-input-${root.id || 'x'}" name="q" class="input flex-1" autocomplete="off" placeholder="${esc(opts.placeholder ?? 'Contoh: lampu yang belum mati?')}" />
        <button type="submit" class="btn btn-primary btn-icon" aria-label="Kirim">${icon('send-horizontal')}</button>
      </form>
    </div>`;

  const log = root.querySelector('[data-chat-log]');
  const suggestBox = root.querySelector('[data-chat-suggest]');
  const form = root.querySelector('[data-chat-form]');
  const input = form.elements.q;
  let messages = loadHistory();
  let busy = false;

  function render() {
    const list = messages.length ? messages : [WELCOME];
    log.innerHTML = list.map((m, i) => (m.role === 'user' ? userHtml(m) : assistantHtml(m, messages.length ? i : -1))).join('') + (busy ? typingHtml : '');
    const last = list[list.length - 1];
    const chips = !busy && last.role === 'assistant' ? last.suggestions ?? [] : [];
    suggestBox.innerHTML = chips.map((s) => `<button type="button" class="btn btn-outline btn-sm shrink-0" data-suggest>${esc(s)}</button>`).join('');
    suggestBox.classList.toggle('hidden', !chips.length);
    renderIcons(root);
    log.scrollTop = log.scrollHeight;
  }

  function push(m) {
    messages.push({ ...m, time: new Date().toISOString() });
    saveHistory(messages);
    render();
  }

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    push({ role: 'user', text: q });
    busy = true;
    render();
    try {
      const history = messages.slice(-10).map(({ role, text: t }) => ({ role, text: t }));
      const res = await api.ask(q, history);
      busy = false;
      push({ role: 'assistant', ...res });
    } catch (err) {
      busy = false;
      push({ role: 'assistant', text: `Maaf, asisten tidak bisa dihubungi. ${err.message}` });
    }
  }

  async function runAction(msgIndex, actionIndex) {
    const msg = messages[msgIndex];
    const { action } = msg.actions[actionIndex];
    if (action.type === 'dismiss') {
      msg.resolved = 'Dibatalkan.';
      saveHistory(messages);
      return render();
    }
    if (action.type === 'setDevices') {
      root.querySelectorAll(`[data-msg="${msgIndex}"]`).forEach((b) => (b.disabled = true));
      try {
        const { updated } = await api.setDevices(action.ids, action.on);
        msg.resolved = `Selesai: ${updated} perangkat ${action.on ? 'dinyalakan' : 'dimatikan'}.`;
        window.dispatchEvent(new CustomEvent(DEVICES_CHANGED));
      } catch (err) {
        msg.resolved = `Gagal: ${err.message}`;
      }
      saveHistory(messages);
      render();
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value;
    input.value = '';
    ask(q);
  });
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-suggest]');
    if (chip) return ask(chip.textContent);
    const btn = e.target.closest('[data-action]');
    if (btn) runAction(Number(btn.dataset.msg), Number(btn.dataset.action));
  });
  render();
  if (opts.autoFocus) input.focus();

  return {
    ask,
    reset() {
      messages = [];
      saveHistory(messages);
      render();
    },
  };
}
