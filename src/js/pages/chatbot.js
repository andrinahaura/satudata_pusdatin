import { createChat } from '../components/chat.js';
import { renderIcons } from '../components/icons.js';
import { mountLayout } from '../components/layout.js';
import {
  activeConversation, CHATS_CHANGED, deleteConversation, listConversations, setActiveConversation, startNewConversation,
} from '../services/chat-store.js';
import { $, esc, getParam, setParams } from '../utils/dom.js';

mountLayout({ page: 'chatbot' });

const chat = createChat(document.getElementById('main-chat'), { variant: 'full', autoFocus: true });

const panel = $('[data-history-panel]');
const openButton = $('[data-history-open]');

const dayFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

// Riwayat dikelompokkan per bulan; bulan berjalan tanpa judul kelompok.
function renderHistory() {
  const list = listConversations();
  const active = activeConversation()?.id;
  const thisMonth = monthFmt.format(new Date());
  if (!list.length) {
    $('[data-history]').innerHTML = '<p class="px-3 py-2 text-mid-gray">Belum ada percakapan.</p>';
    return;
  }
  const groups = new Map();
  for (const c of list) {
    const key = monthFmt.format(new Date(c.updatedAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  $('[data-history]').innerHTML = [...groups.entries()]
    .map(([month, items]) => `
      <div class="mb-3">
        ${month === thisMonth ? '' : `<p class="label-caps px-3 pt-2 pb-1">${esc(month)}</p>`}
        <ul>
          ${items
            .map(
              (c) => `<li class="group relative">
                <button type="button" data-conv="${c.id}" aria-current="${c.id === active}"
                  class="w-full cursor-pointer rounded-nested px-3 py-2.5 pr-9 text-left transition-colors hover:bg-canvas ${c.id === active ? 'bg-canvas' : ''}">
                  <span class="block truncate font-medium">${esc(c.title)}</span>
                  <span class="block text-caption tracking-normal text-mid-gray">${dayFmt.format(new Date(c.updatedAt))}</span>
                </button>
                <button type="button" data-delete="${c.id}" aria-label="Hapus percakapan ${esc(c.title)}"
                  class="btn btn-ghost btn-icon absolute top-2.5 right-1 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><i data-lucide="x" class="size-3.5"></i></button>
              </li>`,
            )
            .join('')}
        </ul>
      </div>`)
    .join('');
  renderIcons($('[data-history]'));
}

function setPanel(open) {
  panel.classList.toggle('hidden', !open);
  panel.classList.toggle('flex', open);
  openButton.setAttribute('aria-expanded', String(open));
}

$('[data-history]').addEventListener('click', (e) => {
  const del = e.target.closest('[data-delete]');
  if (del) return deleteConversation(del.dataset.delete);
  const item = e.target.closest('[data-conv]');
  if (!item) return;
  setActiveConversation(item.dataset.conv);
  if (window.matchMedia('(max-width: 1023px)').matches) setPanel(false);
});
$('[data-new-chat]').addEventListener('click', () => {
  startNewConversation();
  if (window.matchMedia('(max-width: 1023px)').matches) setPanel(false);
});
openButton.addEventListener('click', () => setPanel(true));
$('[data-history-close]').addEventListener('click', () => setPanel(false));

window.addEventListener(CHATS_CHANGED, renderHistory);
renderHistory();
renderIcons($('main'));

// Pertanyaan yang dikirim lewat ?q= (mis. dari halaman lain).
const q = getParam('q');
if (q) {
  setParams({ q: null });
  chat.ask(q);
}
