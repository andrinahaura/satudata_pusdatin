import { mountLayout } from '../components/layout.js';
import { createChat } from '../components/chat.js';
import { icon, renderIcons } from '../components/icons.js';
import { api, DEVICES_CHANGED } from '../services/api.js';
import { summarizeIot, summarizeParking } from '../services/selectors.js';
import { $, esc, getParam, setParams } from '../utils/dom.js';
import { fmt1, fmtTime } from '../utils/format.js';

mountLayout({ page: 'chatbot' });

const EXAMPLES = [
  { title: 'Perangkat IoT', icon: 'lightbulb', items: ['Lampu yang belum mati?', 'AC lantai 2 yang menyala?', 'Perangkat mana yang offline?'] },
  { title: 'Kenyamanan & energi', icon: 'thermometer', items: ['Ruangan terpanas?', 'Suhu ruang server sekarang?', 'Konsumsi listrik per lantai'] },
  { title: 'Parkir', icon: 'car', items: ['Berapa slot parkir yang kosong?', 'Slot parkir motor yang kosong?', 'Kendaraan masuk hari ini?'] },
  { title: 'Aksi', icon: 'power', items: ['Ruang kosong tapi lampu masih menyala?', 'Matikan lampu lantai 3', 'Matikan AC di ruang kosong'] },
];

const chat = createChat(document.getElementById('main-chat'), { autoFocus: true, placeholder: 'Tanya tentang gedung… contoh: lampu yang belum mati?' });

$('[data-reset]').addEventListener('click', () => chat.reset());

$('[data-examples]').innerHTML = EXAMPLES.map((g) => `
  <div>
    <h3 class="label-caps mb-2 flex items-center gap-1.5">${icon(g.icon, 'size-3.5')}${esc(g.title)}</h3>
    <div class="flex flex-wrap gap-2">${g.items.map((q) => `<button type="button" class="btn btn-outline btn-sm" data-example>${esc(q)}</button>`).join('')}</div>
  </div>`).join('');
$('[data-examples]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-example]');
  if (b) chat.ask(b.textContent);
});

const state = { iot: null, parking: null };

function renderContext() {
  if (!state.iot || !state.parking) return;
  const s = summarizeIot(state.iot);
  const p = summarizeParking(state.parking);
  const rows = [
    ['Lampu menyala', `${s.byType.light.on}/${s.byType.light.total}`],
    ['AC menyala', `${s.byType.ac.on}/${s.byType.ac.total}`],
    ['Perangkat offline', s.offline],
    ['Suhu rata-rata', `${fmt1(s.avgTemp)}°C`],
    ['Parkir kosong', `${p.free}/${p.total}`],
    ['Diperbarui', fmtTime(state.iot.updatedAt)],
  ];
  $('[data-context]').innerHTML = rows
    .map(([k, v]) => `<div><dt class="text-caption tracking-normal text-mid-gray">${k}</dt><dd class="font-semibold tabular-nums">${esc(v)}</dd></div>`)
    .join('');
}

async function load() {
  [state.iot, state.parking] = await Promise.all([api.getIot(), api.getParking()]);
  renderContext();
}

api.subscribe((next) => {
  Object.assign(state, next);
  renderContext();
});
window.addEventListener(DEVICES_CHANGED, async () => {
  state.iot = await api.getIot();
  renderContext();
});

// Pertanyaan dari command palette (⌘K) dikirim lewat ?q=
const q = getParam('q');
if (q) {
  setParams({ q: null });
  chat.ask(q);
}

load();
renderIcons($('main'));
