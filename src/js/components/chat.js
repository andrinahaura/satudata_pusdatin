// Komponen chat AI.
//   variant 'full'    : halaman Chatbot (gaya TEJAS Chatbot PU): layar awal dengan kotak tanya besar,
//                       pintas unit organisasi PU, kartu saran; lampiran dokumen, pilihan model, dikte suara.
//   variant 'compact' : widget di Home.
// Keduanya memakai percakapan aktif yang sama dari chat-store.
// Jawaban asisten bisa membawa rujukan dokumen (citations), grafik (chart), dan pemakaian token (usage).
// Setiap jawaban bisa dinilai "Sesuai" / "Tidak sesuai" untuk analitik mutu layanan.
import { api, DEVICES_CHANGED } from '../services/api.js';
import { DEFAULT_SUGGESTIONS, DOCUMENT_SUGGESTIONS, MODELS, SITABA_SUGGESTIONS, UNITS } from '../services/chat-engine.js';
import { activeConversation, CHATS_CHANGED, createConversation, saveConversation } from '../services/chat-store.js';
import { esc } from '../utils/dom.js';
import { fmtInt, fmtTime } from '../utils/format.js';
import { icon, renderIcons } from './icons.js';
import { lineLegendHtml, miniLineChartSvg } from './line-chart.js';
import { barListHtml } from './ui.js';

// Isi file teks dibaca di browser dan ikut dikirim (dipotong) supaya bisa dianalisis.
const TEXT_LIMIT = 20000;
const isTextFile = (file) => file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name);

const BUILDING_CARDS = ['Pemakaian listrik hari ini?', 'Ruang kosong tapi lampu masih menyala?', 'Perangkat mana yang offline?', 'Berapa slot parkir yang kosong?'];

const unitLabel = (id) => UNITS.find((u) => u.id === id)?.label ?? 'Gedung Pusdatin';
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const fmtValue = (v, unit) => (unit === '%' ? `${Math.round(v)}%` : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ${unit ?? ''}`.trim());

function chartHtml(chart) {
  if (!chart) return '';
  const title = `<p class="mb-2 text-caption tracking-normal text-mid-gray">${esc(chart.title)}</p>`;
  if (chart.kind === 'bar') {
    return `<div class="mt-2 rounded-nested border border-hairline bg-paper p-3">${title}${barListHtml(chart.bars, { format: (v) => fmtValue(v, chart.unit) })}</div>`;
  }
  const main = chart.series.find((x) => x.style === 'current') ?? chart.series[0];
  const values = main.values.filter((v) => v != null);
  const peak = values.length ? Math.max(...values) : 0;
  const peakLabel = chart.labels[main.values.indexOf(peak)];
  return `<div class="mt-2 rounded-nested border border-hairline bg-paper p-3">
      ${title}
      ${miniLineChartSvg({ series: chart.series })}
      <div class="mt-1 flex justify-between text-caption tracking-normal text-mid-gray"><span>${esc(chart.labels[0])}</span><span>${esc(chart.labels[chart.labels.length - 1])}</span></div>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        ${chart.series.length > 1 ? lineLegendHtml(chart.series) : '<span></span>'}
        <span class="text-caption tracking-normal text-mid-gray">Puncak ${esc(fmtValue(peak, chart.unit))}${peakLabel ? ` · ${esc(peakLabel)}` : ''}</span>
      </div>
    </div>`;
}

function citationsHtml(citations) {
  if (!citations?.length) return '';
  return `<div class="mt-3 border-t border-hairline pt-2">
      <p class="label-caps mb-1.5">Rujukan</p>
      <ol class="space-y-1.5">
        ${citations
          .map((c) => `<li class="flex gap-2 text-[13px]">
            <span class="grid size-5 shrink-0 place-items-center rounded-full bg-paper text-[11px] font-semibold tabular-nums">${c.n}</span>
            <span class="min-w-0"><span class="font-medium">${esc(c.title)}</span>${c.ref ? ` <span class="text-mid-gray">· ${esc(c.ref)}</span>` : ''}
              <span class="block text-mid-gray">${esc(c.snippet)}</span></span>
          </li>`)
          .join('')}
      </ol>
    </div>`;
}

function metaHtml(m, index) {
  const tokens = m.usage ? m.usage.inputTokens + m.usage.outputTokens : null;
  const info = [m.time && fmtTime(m.time), m.model, tokens && `${fmtInt(tokens)} token`].filter(Boolean).map(esc).join(' · ');
  // Jawaban error (tanpa model) tidak dinilai.
  const rating = m.model
    ? `<span class="inline-flex items-center gap-1" role="group" aria-label="Penilaian jawaban">
        <span class="mr-1">Jawaban sesuai?</span>
        ${[['up', 'Sesuai', 'check'], ['down', 'Tidak sesuai', 'x']]
          .map(([v, label, ic]) => `<button type="button" data-rate="${index}" data-rating="${v}" aria-pressed="${m.rating === v}"
              class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-pill px-2 font-medium transition-colors ${m.rating === v ? 'bg-ink text-paper' : 'border border-hairline text-ink hover:bg-canvas'}">${icon(ic, 'size-3')}${label}</button>`)
          .join('')}
      </span>`
    : '';
  if (!info && !rating) return '';
  return `<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption tracking-normal text-mid-gray">${info ? `<span>${info}</span>` : ''}${rating}</div>`;
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
        ${items}${chartHtml(m.chart)}${citationsHtml(m.citations)}${actions}${resolved}${link}
      </div>
      ${metaHtml(m, index)}
    </div>
  </div>`;
}

function userHtml(m) {
  return `<div class="flex justify-end">
    <div class="max-w-[85%] rounded-[18px] rounded-tr-small bg-ink px-3.5 py-2.5 text-paper">
      ${m.attachment ? `<p class="mb-1 text-caption tracking-normal text-paper/70">Lampiran: ${esc(m.attachment.name)}</p>` : ''}
      <p class="whitespace-pre-line">${esc(m.text)}</p>
    </div>
  </div>`;
}

const typingHtml = `<div class="flex" data-typing><div class="typing flex items-center gap-1 rounded-[18px] rounded-tl-small bg-canvas px-4 py-3">${'<span class="size-1.5 rounded-full bg-mid-gray"></span>'.repeat(3)}</div></div>`;

function fullSkeleton(id) {
  return `
    <div class="flex h-full min-h-0 flex-col" data-chat-outer>
      <div data-chat-scroll class="scroll-thin">
        <div class="mx-auto w-full max-w-3xl px-5">
          <div data-chat-hero class="pt-10 pb-8 text-center lg:pt-20">
            <h1 class="text-heading-lg font-semibold">Apa yang ingin Anda ketahui?</h1>
            <p class="mt-2 text-mid-gray">Kondisi Gedung Pusdatin, atau dokumen dan regulasi unit organisasi PU.</p>
          </div>
          <div data-chat-log class="space-y-5 py-6" aria-live="polite"></div>
        </div>
      </div>
      <div class="mx-auto w-full max-w-3xl px-5 pb-5">
        <div data-chat-suggest class="scroll-thin flex gap-2 overflow-x-auto pb-3"></div>
        <form data-chat-form class="rounded-card border border-hairline bg-paper shadow-card transition-colors focus-within:border-line">
          <div data-chat-attachment class="hidden px-4 pt-3"></div>
          <label class="sr-only" for="chat-q-${id}">Pertanyaan</label>
          <textarea id="chat-q-${id}" name="q" rows="1" class="scroll-thin block max-h-48 w-full resize-none bg-transparent px-5 pt-4 pb-2 text-body-lg outline-none placeholder:text-mid-gray" placeholder="Masukkan pertanyaan…"></textarea>
          <div class="flex items-center gap-2 px-3 pb-3">
            <button type="button" class="btn btn-outline btn-icon size-8" data-chat-attach aria-label="Lampirkan dokumen" title="Lampirkan dokumen (PDF, Word, teks)">${icon('plus')}</button>
            <input type="file" class="hidden" accept=".pdf,.doc,.docx,.txt,.md,.csv" data-chat-file />
            <label class="relative">
              <span class="sr-only">Model</span>
              <select data-chat-model class="h-8 cursor-pointer appearance-none rounded-pill bg-canvas pr-8 pl-3 text-[13px] font-medium text-ink outline-none">
                ${MODELS.map((m) => `<option>${esc(m)}</option>`).join('')}
              </select>
              ${icon('chevron-down', 'pointer-events-none absolute top-2 right-2.5 size-4 text-mid-gray')}
            </label>
            <span data-chat-unit class="badge badge-soft max-sm:hidden"></span>
            <span class="flex-1"></span>
            <button type="button" class="btn btn-ghost btn-icon size-9 ${SpeechRecognition ? '' : 'hidden'}" data-chat-mic aria-label="Dikte suara" aria-pressed="false">${icon('mic')}</button>
            <button type="submit" class="btn btn-primary btn-icon size-10" aria-label="Kirim">${icon('arrow-up')}</button>
          </div>
        </form>
        <div data-chat-start class="pb-4">
          <p class="label-caps mt-8 mb-3">Pintas chatbot unit organisasi PU</p>
          <div class="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Unit organisasi" data-chat-units></div>
          <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-chat-cards></div>
        </div>
      </div>
    </div>`;
}

function compactSkeleton(id, placeholder) {
  return `
    <div class="flex h-full min-h-0 flex-col">
      <div data-chat-scroll class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4"><div data-chat-log class="space-y-4" aria-live="polite"></div></div>
      <div data-chat-suggest class="scroll-thin flex gap-2 overflow-x-auto px-5 pb-3"></div>
      <form data-chat-form class="flex items-center gap-2 border-t border-hairline p-3">
        <label class="sr-only" for="chat-q-${id}">Pertanyaan</label>
        <input id="chat-q-${id}" name="q" class="input flex-1" autocomplete="off" placeholder="${esc(placeholder)}" />
        <button type="submit" class="btn btn-primary btn-icon" aria-label="Kirim">${icon('arrow-up')}</button>
      </form>
    </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {{ variant?: 'full'|'compact', placeholder?: string, autoFocus?: boolean }} [opts]
 */
export function createChat(root, opts = {}) {
  const full = opts.variant === 'full';
  const id = root.id || 'x';
  root.innerHTML = full ? fullSkeleton(id) : compactSkeleton(id, opts.placeholder ?? 'Contoh: lampu yang belum mati?');

  const $ = (sel) => root.querySelector(sel);
  const scroll = $('[data-chat-scroll]');
  const log = $('[data-chat-log]');
  const suggestBox = $('[data-chat-suggest]');
  const form = $('[data-chat-form]');
  const input = form.elements.q;

  let conv = activeConversation();
  let draft = { unit: conv?.unit ?? 'pusdatin', model: conv?.model ?? MODELS[0], attachment: null };
  let busy = false;
  let recognition = null;

  function renderComposer() {
    if (!full) return;
    const unit = conv?.unit ?? draft.unit;
    $('[data-chat-model]').value = conv?.model ?? draft.model;
    $('[data-chat-unit]').textContent = unitLabel(unit);
    const att = $('[data-chat-attachment]');
    att.classList.toggle('hidden', !draft.attachment);
    att.innerHTML = draft.attachment
      ? `<span class="inline-flex max-w-full items-center gap-1 rounded-pill bg-accent-soft py-1 pr-1 pl-3 text-[13px] font-medium text-ink">
          <span class="truncate">${esc(draft.attachment.name)}</span>
          <button type="button" class="btn btn-ghost btn-icon size-6" data-chat-detach aria-label="Hapus lampiran">${icon('x', 'size-3.5')}</button>
        </span>`
      : '';
  }

  function renderStart(empty) {
    if (!full) return;
    $('[data-chat-start]').classList.toggle('hidden', !empty);
    $('[data-chat-hero]').classList.toggle('hidden', !empty);
    $('[data-chat-unit]').classList.toggle('hidden', empty);
    // Layar awal: semua bagian mengalir dalam satu kolom yang bisa di-scroll.
    // Saat bercakap: log mengisi tinggi dan kotak tanya menempel di bawah.
    $('[data-chat-outer]').className = `flex h-full min-h-0 flex-col ${empty ? 'scroll-thin overflow-y-auto' : ''}`;
    scroll.className = empty ? 'flex-none' : 'scroll-thin min-h-0 flex-1 overflow-y-auto';
    input.rows = empty ? 3 : 1;
    if (!empty) return;
    $('[data-chat-units]').innerHTML = UNITS.map(
      (u) => `<button type="button" role="radio" aria-checked="${u.id === draft.unit}" data-chat-unit-id="${u.id}"
        class="btn btn-sm shrink-0 ${u.id === draft.unit ? 'bg-ink text-paper hover:bg-ink-soft' : 'btn-outline'}">${esc(u.label)}</button>`,
    ).join('');
    const prompts = draft.unit === 'pusdatin' ? BUILDING_CARDS : draft.unit === 'sitaba' ? SITABA_SUGGESTIONS : DOCUMENT_SUGGESTIONS;
    const category = draft.unit === 'pusdatin' ? 'Gedung' : draft.unit === 'sitaba' ? 'Kebencanaan' : 'Dokumen';
    $('[data-chat-cards]').innerHTML = prompts
      .map(
        (p, i) => `<button type="button" data-suggest="${esc(p)}"
          class="flex min-h-28 cursor-pointer flex-col justify-between gap-6 rounded-nested border border-hairline p-4 text-left transition-colors hover:border-line ${i % 2 ? 'bg-accent-soft' : 'bg-canvas'}">
          <span class="label-caps">${category}</span>
          <span class="font-medium text-ink">${esc(p)}</span>
        </button>`,
      )
      .join('');
  }

  function render() {
    const messages = conv?.messages ?? [];
    const empty = full && !messages.length;
    log.innerHTML = messages.length
      ? messages.map((m, i) => (m.role === 'user' ? userHtml(m) : assistantHtml(m, i))).join('') + (busy ? typingHtml : '')
      : full ? '' : '<p class="text-mid-gray">Belum ada percakapan.</p>';
    log.classList.toggle('hidden', empty);
    const last = messages[messages.length - 1];
    // Widget Home tanpa percakapan: tampilkan contoh pertanyaan sebagai chip.
    const chips = busy ? [] : last ? (last.role === 'assistant' ? last.suggestions ?? [] : []) : full ? [] : DEFAULT_SUGGESTIONS.slice(0, 4);
    suggestBox.innerHTML = chips.map((s) => `<button type="button" class="btn btn-outline btn-sm shrink-0" data-suggest="${esc(s)}">${esc(s)}</button>`).join('');
    suggestBox.classList.toggle('hidden', !chips.length);
    renderStart(empty);
    renderComposer();
    renderIcons(root);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function persist() {
    if (conv) saveConversation(conv);
  }

  function push(m) {
    conv.messages.push({ ...m, time: new Date().toISOString() });
    persist();
    render();
  }

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    conv ??= createConversation({ unit: draft.unit, model: draft.model });
    const file = draft.attachment;
    const attachment = file ? { name: file.name, size: file.size, type: file.type } : null;
    draft.attachment = null;
    push({ role: 'user', text: q, ...(attachment ? { attachment } : {}) });
    busy = true;
    render();
    try {
      const history = conv.messages.slice(-10).map(({ role, text: t }) => ({ role, text: t }));
      // Isi teks tidak disimpan di riwayat percakapan, hanya dikirim bersama pertanyaan.
      const text = file && isTextFile(file) ? (await file.text()).slice(0, TEXT_LIMIT) : null;
      // messageId = posisi jawaban yang akan datang, dipakai lagi saat jawaban dinilai.
      const messageId = `${conv.id}-${conv.messages.length}`;
      const res = await api.ask(q, history, { unit: conv.unit, model: conv.model, messageId, ...(attachment ? { attachment: { ...attachment, ...(text ? { text } : {}) } } : {}) });
      busy = false;
      push({ role: 'assistant', ...res });
    } catch (err) {
      busy = false;
      push({ role: 'assistant', text: `Maaf, asisten tidak bisa dihubungi. ${err.message}` });
    }
  }

  async function rate(msgIndex, rating) {
    const msg = conv.messages[msgIndex];
    const previous = msg.rating ?? null;
    const next = previous === rating ? null : rating;
    msg.rating = next;
    persist();
    render();
    const question = [...conv.messages.slice(0, msgIndex)].reverse().find((m) => m.role === 'user')?.text ?? '';
    try {
      await api.rateAnswer({ messageId: `${conv.id}-${msgIndex}`, rating: next, previous, model: msg.model, question, answer: msg.text });
    } catch (err) {
      console.warn('[chat] penilaian gagal dikirim', err);
    }
  }

  async function runAction(msgIndex, actionIndex) {
    const msg = conv.messages[msgIndex];
    const { action } = msg.actions[actionIndex];
    if (action.type === 'dismiss') {
      msg.resolved = 'Dibatalkan.';
      persist();
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
      persist();
      render();
    }
  }

  function submit() {
    const q = input.value;
    input.value = '';
    autosize();
    ask(q);
  }

  function autosize() {
    if (input.tagName !== 'TEXTAREA') return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  input.addEventListener('keydown', (e) => {
    // Enter kirim, Shift+Enter baris baru.
    if (input.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener('input', autosize);

  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-suggest]');
    if (chip) return ask(chip.dataset.suggest);
    const btn = e.target.closest('[data-action]');
    if (btn) return runAction(Number(btn.dataset.msg), Number(btn.dataset.action));
    const rateBtn = e.target.closest('[data-rate]');
    if (rateBtn) return rate(Number(rateBtn.dataset.rate), rateBtn.dataset.rating);
    const unit = e.target.closest('[data-chat-unit-id]');
    if (unit) {
      draft.unit = unit.dataset.chatUnitId;
      return render();
    }
    if (e.target.closest('[data-chat-attach]')) return $('[data-chat-file]').click();
    if (e.target.closest('[data-chat-detach]')) {
      draft.attachment = null;
      $('[data-chat-file]').value = '';
      return renderComposer();
    }
    if (e.target.closest('[data-chat-mic]')) toggleMic();
  });

  if (full) {
    $('[data-chat-file]').addEventListener('change', (e) => {
      draft.attachment = e.target.files[0] ?? null;
      renderComposer();
      renderIcons(root);
      input.focus();
    });
    $('[data-chat-model]').addEventListener('change', (e) => {
      draft.model = e.target.value;
      if (conv) {
        conv.model = draft.model;
        persist();
      }
    });
  }

  function toggleMic() {
    const button = $('[data-chat-mic]');
    if (recognition) {
      recognition.stop();
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const text = [...e.results].map((r) => r[0].transcript).join(' ');
      input.value = `${input.value ? `${input.value} ` : ''}${text}`;
      autosize();
    };
    recognition.onend = () => {
      recognition = null;
      button.setAttribute('aria-pressed', 'false');
      button.classList.remove('bg-accent', 'text-ink');
      input.focus();
    };
    button.setAttribute('aria-pressed', 'true');
    button.classList.add('bg-accent', 'text-ink');
    recognition.start();
  }

  // Percakapan dipilih / dibuat dari tempat lain (sidebar riwayat, tab lain).
  window.addEventListener(CHATS_CHANGED, () => {
    if (busy) return;
    const next = activeConversation();
    if (next !== conv) {
      conv = next;
      draft = { unit: conv?.unit ?? 'pusdatin', model: conv?.model ?? MODELS[0], attachment: null };
      render();
    }
  });

  render();
  if (opts.autoFocus) input.focus();

  return { ask };
}
