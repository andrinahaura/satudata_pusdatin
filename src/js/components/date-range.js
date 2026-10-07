// Pemilih rentang waktu: satu tombol "kalender" yang membuka panel berisi
// Hari ini, Kemarin, 7 hari, 30 hari, dan Custom (tanggal dari–sampai).
// Wajib ada di setiap dashboard, di kanan judul halaman. Pilihan disimpan di URL
// (?range=, &from=, &to=) dan localStorage, jadi rentang yang sama terbawa saat pindah halaman.
//
//   const picker = createDateRange($('[data-range]'), { onChange: (range) => render() });
//   picker.range  // objek dari resolveRange(), selalu dihitung ulang terhadap jam sekarang
import { esc, getParam, setParams } from '../utils/dom.js';
import { addDays, dateKey, DEFAULT_RANGE, isDateKey, MAX_RANGE_DAYS, RANGE_PRESETS, resolveRange, startOfDay } from '../utils/range.js';
import { icon, renderIcons } from './icons.js';

const KEY = 'sdp:range:v1';

// Nama di daftar pilihan (lebih jelas dari label tombol).
const MENU_LABEL = { today: 'Hari ini', yesterday: 'Kemarin', '7d': '7 hari terakhir', '30d': '30 hari terakhir' };

function readSpec() {
  const preset = getParam('range');
  if (preset) return { preset, from: getParam('from'), to: getParam('to') };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.preset) return saved;
  } catch {
    /* storage diblokir / rusak */
  }
  return DEFAULT_RANGE;
}

function saveSpec(spec) {
  setParams({ range: spec.preset, from: spec.from ?? null, to: spec.to ?? null });
  try {
    localStorage.setItem(KEY, JSON.stringify(spec));
  } catch {
    /* tetap jalan tanpa disimpan */
  }
}

let uid = 0;

/**
 * @param {HTMLElement} root
 * @param {{ onChange?: (range: object) => void }} [opts]
 */
export function createDateRange(root, { onChange } = {}) {
  const id = `range-${++uid}`;
  let spec = resolveRange(readSpec()).spec;
  let open = false;
  let error = '';

  const todayKey = () => dateKey(startOfDay(new Date()));
  const minKey = () => dateKey(addDays(startOfDay(new Date()), -(MAX_RANGE_DAYS * 2)));

  function panelHtml(range) {
    const presets = RANGE_PRESETS.filter((p) => p.value !== 'custom');
    return `
      <div id="${id}-panel" class="card absolute top-full right-0 z-40 mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden p-0" role="dialog" aria-label="Pilih rentang waktu">
        <ul class="p-2">
          ${presets
            .map((p) => {
              const r = resolveRange({ preset: p.value });
              const active = range.preset === p.value;
              return `<li><button type="button" data-range-preset="${p.value}" aria-pressed="${active}"
                class="flex w-full cursor-pointer items-center gap-3 rounded-nested px-3 py-2.5 text-left transition-colors hover:bg-canvas ${active ? 'bg-canvas' : ''}">
                <span class="flex-1 font-medium">${esc(MENU_LABEL[p.value])}</span>
                <span class="text-caption tracking-normal text-mid-gray tabular-nums">${esc(r.label)}</span>
                <span class="w-4 shrink-0">${active ? icon('check', 'size-4') : ''}</span>
              </button></li>`;
            })
            .join('')}
        </ul>
        <form class="border-t border-hairline p-4" data-range-form>
          <p class="flex items-center justify-between font-medium">Custom ${range.preset === 'custom' ? icon('check', 'size-4') : ''}</p>
          <div class="mt-2 grid grid-cols-2 gap-3">
            <label class="block"><span class="text-caption tracking-normal text-mid-gray">Dari</span>
              <input type="date" name="from" class="input mt-1 px-2" required min="${minKey()}" max="${todayKey()}" value="${esc(range.keys[0])}" /></label>
            <label class="block"><span class="text-caption tracking-normal text-mid-gray">Sampai</span>
              <input type="date" name="to" class="input mt-1 px-2" required min="${minKey()}" max="${todayKey()}" value="${esc(range.keys[range.keys.length - 1])}" /></label>
          </div>
          ${error ? `<p class="mt-2 flex items-center gap-1.5 text-ember">${icon('triangle-alert', 'size-4')}${esc(error)}</p>` : `<p class="mt-2 text-caption tracking-normal text-mid-gray">Maksimal ${MAX_RANGE_DAYS} hari.</p>`}
          <button type="submit" class="btn btn-primary btn-sm mt-3 w-full">Terapkan</button>
        </form>
      </div>`;
  }

  function render() {
    const range = resolveRange(spec);
    const title = range.preset === 'custom' ? 'Custom' : RANGE_PRESETS.find((p) => p.value === range.preset).label;
    root.innerHTML = `
      <div class="relative">
        <button type="button" class="btn btn-outline h-10 max-w-full bg-paper" data-range-toggle aria-expanded="${open}" aria-controls="${id}-panel" aria-haspopup="dialog">
          ${icon('calendar-days', 'size-4 shrink-0 text-mid-gray')}
          <span class="font-semibold">${esc(title)}</span>
          <span class="truncate font-normal text-mid-gray tabular-nums max-sm:hidden">${esc(range.label)}</span>
          ${icon('chevron-down', `size-4 shrink-0 text-mid-gray transition-transform ${open ? 'rotate-180' : ''}`)}
        </button>
        ${open ? panelHtml(range) : ''}
      </div>`;
    renderIcons(root);
  }

  function setOpen(next) {
    open = next;
    error = '';
    render();
    if (open) root.querySelector('[aria-pressed="true"], [data-range-preset]')?.focus();
    else root.querySelector('[data-range-toggle]')?.focus();
  }

  function apply(next) {
    spec = resolveRange(next).spec;
    saveSpec(spec);
    setOpen(false);
    onChange?.(resolveRange(spec));
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-range-toggle]')) return setOpen(!open);
    const btn = e.target.closest('[data-range-preset]');
    if (btn) apply({ preset: btn.dataset.rangePreset });
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const { from, to } = e.target.elements;
    const a = from.value;
    const b = to.value;
    if (!isDateKey(a) || !isDateKey(b)) error = 'Isi kedua tanggal.';
    else if (a > b) error = 'Tanggal "Dari" harus sebelum "Sampai".';
    else {
      const days = Math.round((new Date(`${b}T00:00`) - new Date(`${a}T00:00`)) / 86400000) + 1;
      if (days > MAX_RANGE_DAYS) error = `Rentang terlalu panjang (${days} hari).`;
    }
    if (error) return render();
    apply({ preset: 'custom', from: a, to: b });
  });

  // Tutup panel saat klik di luar atau tekan Escape. composedPath dipakai karena
  // elemen yang diklik bisa sudah diganti render() sebelum event sampai di document.
  document.addEventListener('click', (e) => {
    if (open && !e.composedPath().includes(root)) {
      open = false;
      render();
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  render();

  return {
    get range() {
      return resolveRange(spec);
    },
  };
}
