// Panel Peringatan di halaman IoT.
// Dirancang supaya mudah dipahami semua pengguna, termasuk pengguna lanjut usia:
//   - teks utama 16px, lokasi & saran 14px (bukan teks kecil 12px)
//   - tingkat ditandai label teks ("Kritis"/"Perhatian"), tidak hanya warna
//   - setiap peringatan menyebut apa yang perlu dilakukan, dalam bahasa sehari-hari
//   - aksi berupa tautan teks yang jelas ("Lihat di denah"), bukan baris yang diam-diam bisa diklik
// Tata letak: satu baris untuk setiap hal yang dipantau (koneksi perangkat, listrik, lampu di
// ruang kosong, parkir), jadi isi panel selalu lengkap dan tingginya sama dengan kartu Telegram.
//   - ada masalah : baris lengkap (jumlah, lokasi, saran, tombol), peringatan sejenis dikelompokkan
//                   ("6 ruang kosong …") dan daftar lokasinya bisa dibuka
//   - normal      : baris ringkas dengan nilai saat ini ("24/24 online")
//   - baris berbagi sisa tinggi panel; bila daftar dibuka dan terlalu panjang, panel bisa digulir.
import { esc } from '../utils/dom.js';

const SEVERITY = {
  critical: { label: 'Kritis', text: 'text-ember' },
  warning: { label: 'Perhatian', text: 'text-mid-gray' },
};

// Urutan baris saat normal, nama hal yang dipantau, judul kelompok, saran, dan label tombol.
const TYPES = {
  offline: {
    label: 'Koneksi perangkat',
    short: 'Perangkat offline',
    many: (n) => `${n} perangkat offline`,
    hint: 'Perangkat tidak mengirim data. Periksa listrik atau koneksi perangkat.',
    action: 'Lihat di denah',
  },
  energy: {
    label: 'Listrik per lantai',
    short: 'Listrik di atas target',
    many: (n) => `${n} lantai di atas target listrik`,
    hint: 'Pemakaian listrik jam ini lebih tinggi dari target. Cek lampu yang tidak dipakai.',
    action: 'Lihat grafik listrik',
  },
  waste: {
    label: 'Lampu di ruang kosong',
    short: 'Ruang kosong, lampu menyala',
    many: (n) => `${n} ruang kosong, lampu menyala`,
    hint: 'Tidak ada orang di ruang ini. Matikan lampu dari halaman IoT.',
    action: 'Lihat di denah',
  },
  parking: {
    label: 'Ruang parkir tersedia',
    short: 'Parkir hampir penuh',
    many: (n) => `${n} zona parkir hampir penuh`,
    hint: 'Sisa ruang parkir kurang dari 10%.',
    action: 'Lihat peta parkir',
  },
};

const RANK = { critical: 0, warning: 1 };

function groupAlerts(alerts) {
  const groups = new Map();
  for (const a of alerts) {
    const key = a.type ?? a.id;
    if (!groups.has(key)) groups.set(key, { key, type: a.type, severity: a.severity, items: [] });
    groups.get(key).items.push(a);
  }
  return [...groups.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.items.length - a.items.length);
}

/** Ringkasan per jenis untuk baris Peringatan: [{ label, count, severity }], kritis lebih dulu. */
export const alertTypes = (alerts) =>
  groupAlerts(alerts).map((g) => ({ label: TYPES[g.type]?.short ?? 'Peringatan lain', count: g.items.length, severity: g.severity }));

function placeLine(items) {
  if (items.length === 1) return items[0].meta;
  // Untuk kelompok cukup nama ruang/zona ("09 R. Tim Jaringan"), lantai ada di daftar lengkap.
  const names = items.slice(0, 2).map((i) => (i.place ?? i.meta).split(' · ').pop());
  return items.length > 2 ? `${names.join(', ')}, dan ${items.length - 2} lainnya` : names.join(' dan ');
}

// Baris mengisi sisa tinggi panel bersama-sama (grow), isinya tetap di tengah secara vertikal.
const ROW = 'flex grow flex-col justify-center px-5 py-3';
const LINK = 'cursor-pointer font-medium underline underline-offset-4 hover:text-mid-gray';

function groupHtml(group, expanded) {
  const sev = SEVERITY[group.severity];
  const meta = TYPES[group.type] ?? { many: (n) => `${n} peringatan`, hint: '', action: 'Buka' };
  const { items } = group;
  const single = items.length === 1;
  const title = single ? items[0].title : meta.many(items.length);
  const action = single
    ? `<a href="${esc(items[0].href)}" class="${LINK}">${esc(meta.action)}</a>`
    : `<button type="button" class="${LINK}" data-expand="${esc(group.key)}" aria-expanded="${expanded}">${expanded ? 'Sembunyikan daftar' : `Lihat ${items.length} lokasi`}</button>`;
  const list = !single && expanded
    ? `<ul class="mt-3 divide-y divide-hairline rounded-nested border border-hairline">
        ${items
          .map(
            (i) => `<li><a href="${esc(i.href)}" class="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-canvas">
              <span class="min-w-0"><span class="block truncate font-medium">${esc(i.title)}</span><span class="block truncate text-mid-gray">${esc(i.meta)}</span></span>
              <span class="shrink-0 font-medium underline underline-offset-4">Buka</span>
            </a></li>`,
          )
          .join('')}
      </ul>`
    : '';
  return `<li class="${ROW}">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-body-lg leading-snug font-semibold">${esc(title)}</p>
      <span class="shrink-0 font-medium ${sev.text}">${sev.label}</span>
    </div>
    <p class="mt-0.5 text-mid-gray">${esc(placeLine(items))}</p>
    ${meta.hint ? `<p class="mt-1.5">${esc(meta.hint)}</p>` : ''}
    <div class="mt-2">${action}</div>
    ${list}
  </li>`;
}

function normalHtml(type, value) {
  return `<li class="${ROW}">
    <div class="flex items-baseline justify-between gap-3">
      <p class="min-w-0 font-medium">${esc(TYPES[type].label)}</p>
      <span class="shrink-0 text-mid-gray tabular-nums">Normal · ${esc(value)}</span>
    </div>
  </li>`;
}

/**
 * @param {HTMLElement} root  wadah kolom panel (flex column)
 * @returns {{ update(alerts: object[], ctx: { checks: Record<string, string>, checkedAt: string }): void }}
 *   `checks`: nilai saat normal per jenis peringatan, mis. { offline: '24/24 online' }.
 *   Hanya jenis yang ada di `checks` (atau sedang punya peringatan) yang tampil.
 */
export function createAlertPanel(root) {
  const state = { expanded: new Set(), alerts: [], ctx: null };

  root.innerHTML = `
    <div class="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
      <div class="min-w-0">
        <h3 class="card-title text-body-lg">Peringatan</h3>
        <p class="truncate text-mid-gray" data-alert-checked></p>
      </div>
      <div class="flex shrink-0 font-medium" data-alert-summary></div>
    </div>
    <div class="scroll-thin flex max-h-[560px] min-h-0 flex-1 flex-col overflow-y-auto border-t border-hairline xl:max-h-none" data-alert-body></div>
    <p class="hidden border-t border-hairline px-5 py-2.5 text-mid-gray" data-alert-more></p>`;

  const $ = (sel) => root.querySelector(sel);
  const body = $('[data-alert-body]');

  function render() {
    const { alerts, ctx } = state;
    const count = (sev) => alerts.filter((a) => a.severity === sev).length;
    const critical = count('critical');
    const warning = count('warning');

    $('[data-alert-checked]').textContent = `Kondisi saat ini · dicek ${ctx.checkedAt}`;
    $('[data-alert-summary]').innerHTML = alerts.length
      ? [critical && `<span class="text-ember">${critical} kritis</span>`, warning && `<span>${warning} perhatian</span>`]
          .filter(Boolean)
          .join('<span class="text-mid-gray">,&nbsp;</span>')
      : '<span>Semua normal</span>';

    // Jenis bermasalah di atas (kritis dulu), lalu jenis yang normal sesuai urutan TYPES.
    const groups = groupAlerts(alerts);
    const active = new Set(groups.map((g) => g.type));
    const normal = Object.keys(TYPES).filter((t) => !active.has(t) && ctx.checks[t] != null);

    const scroll = body.scrollTop;
    body.innerHTML = `<ul class="flex grow flex-col divide-y divide-hairline">
        ${groups.map((g) => groupHtml(g, state.expanded.has(g.key))).join('')}
        ${normal.map((t) => normalHtml(t, ctx.checks[t])).join('')}
      </ul>`;
    body.scrollTop = scroll;
    updateScrollHint();
  }

  // Petunjuk bila isi panel lebih panjang dari tempatnya.
  function updateScrollHint() {
    const more = $('[data-alert-more]');
    const overflow = body.scrollHeight - body.clientHeight - body.scrollTop > 8;
    more.classList.toggle('hidden', !overflow);
    more.textContent = 'Gulir ke bawah untuk melihat peringatan lainnya';
  }

  root.addEventListener('click', (e) => {
    const expand = e.target.closest('[data-expand]');
    if (!expand) return;
    const key = expand.dataset.expand;
    state.expanded.has(key) ? state.expanded.delete(key) : state.expanded.add(key);
    render();
  });
  body.addEventListener('scroll', updateScrollHint, { passive: true });
  new ResizeObserver(updateScrollHint).observe(body);

  return {
    update(alerts, ctx) {
      state.alerts = alerts;
      state.ctx = ctx;
      render();
    },
  };
}
