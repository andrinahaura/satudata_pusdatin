// Panel Peringatan di Home.
// Dirancang supaya mudah dipahami semua pengguna, termasuk pengguna lanjut usia:
//   - teks utama 16px, lokasi & saran 14px (bukan teks kecil 12px)
//   - tingkat ditandai label teks ("Kritis"/"Perhatian") + garis warna, tidak hanya warna
//   - setiap peringatan menyebut apa yang perlu dilakukan, dalam bahasa sehari-hari
//   - tombol aksi terlihat jelas ("Lihat di denah"), bukan baris yang diam-diam bisa diklik
// Kasus jumlah:
//   - 0      : "Semua normal" + daftar hal yang dipantau beserta nilainya
//   - sedikit: tiap jenis tampil sebagai satu kartu
//   - banyak : peringatan sejenis dikelompokkan ("6 ruang kosong …") dan bisa dibuka,
//              filter Kritis/Perhatian, maksimal 4 kelompok lalu "Tampilkan …", panel bisa digulir.
import { esc } from '../utils/dom.js';
import { icon, renderIcons } from './icons.js';

const SEVERITY = {
  critical: { label: 'Kritis', bar: 'border-l-ember', badge: 'badge-alert' },
  warning: { label: 'Perhatian', bar: 'border-l-accent', badge: 'badge-outline' },
};

// Judul kelompok, saran tindakan, dan label tombol per jenis peringatan.
const TYPES = {
  offline: {
    many: (n) => `${n} perangkat offline`,
    hint: 'Perangkat tidak mengirim data. Periksa listrik atau koneksi perangkat.',
    action: 'Lihat di denah',
  },
  temperature: {
    many: (n) => `${n} ruang bersuhu tinggi`,
    hint: 'Suhu 29°C atau lebih. Periksa AC di ruang tersebut.',
    action: 'Lihat di denah',
  },
  energy: {
    many: (n) => `${n} lantai di atas target listrik`,
    hint: 'Pemakaian listrik jam ini lebih tinggi dari target. Cek lampu dan AC yang tidak dipakai.',
    action: 'Lihat grafik listrik',
  },
  waste: {
    many: (n) => `${n} ruang kosong, lampu/AC masih menyala`,
    hint: 'Tidak ada orang di ruang ini. Matikan lampu dan AC dari halaman IoT.',
    action: 'Lihat di denah',
  },
  parking: {
    many: (n) => `${n} zona parkir hampir penuh`,
    hint: 'Sisa slot parkir kurang dari 10%.',
    action: 'Lihat peta parkir',
  },
};

const GROUP_LIMIT = 4;
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

function placeLine(items) {
  if (items.length === 1) return items[0].meta;
  // Untuk kelompok cukup nama ruang/zona ("09 R. Tim Jaringan"), lantai ada di daftar lengkap.
  const names = items.slice(0, 2).map((i) => (i.place ?? i.meta).split(' · ').pop());
  return items.length > 2 ? `${names.join(', ')}, dan ${items.length - 2} lainnya` : names.join(' dan ');
}

function groupHtml(group, expanded) {
  const sev = SEVERITY[group.severity];
  const meta = TYPES[group.type] ?? { many: (n) => `${n} peringatan`, hint: '', action: 'Buka' };
  const { items } = group;
  const single = items.length === 1;
  const title = single ? items[0].title : meta.many(items.length);
  const action = single
    ? `<a href="${esc(items[0].href)}" class="btn btn-secondary btn-sm">${esc(meta.action)}</a>`
    : `<button type="button" class="btn btn-secondary btn-sm" data-expand="${esc(group.key)}" aria-expanded="${expanded}">${expanded ? 'Sembunyikan daftar' : `Lihat ${items.length} lokasi`}</button>`;
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
  return `<li class="border-l-4 ${sev.bar} py-3.5 pr-5 pl-4">
    <div class="flex items-start justify-between gap-3">
      <p class="text-body-lg leading-snug font-semibold">${esc(title)}</p>
      <span class="badge ${sev.badge} shrink-0">${sev.label}</span>
    </div>
    <p class="mt-0.5 text-mid-gray">${esc(placeLine(items))}</p>
    ${meta.hint ? `<p class="mt-1.5">${esc(meta.hint)}</p>` : ''}
    <div class="mt-3">${action}</div>
    ${list}
  </li>`;
}

function clearHtml(checks, checkedAt) {
  return `<div class="flex items-center gap-3 px-5 py-4">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-ink">${icon('check', 'size-5')}</span>
      <div>
        <p class="text-body-lg font-semibold">Semua normal</p>
        <p class="text-mid-gray">Tidak ada yang perlu ditindaklanjuti. Dicek ${esc(checkedAt)}.</p>
      </div>
    </div>
    <ul class="divide-y divide-hairline border-t border-hairline">
      ${checks.map((c) => `<li class="flex items-center justify-between gap-3 px-5 py-2.5"><span>${esc(c.label)}</span><span class="font-medium tabular-nums">${esc(c.value)}</span></li>`).join('')}
    </ul>`;
}

/**
 * @param {HTMLElement} root  wadah kolom panel (flex column)
 * @returns {{ update(alerts: object[], ctx: { checks: {label,value}[], checkedAt: string }): void }}
 */
export function createAlertPanel(root) {
  const state = { filter: 'all', expanded: new Set(), showAll: false, alerts: [], ctx: null };

  root.innerHTML = `
    <div class="flex items-center justify-between gap-3 px-5 pt-5">
      <h2 class="card-title text-body-lg">Peringatan</h2>
      <div class="flex gap-1.5" data-alert-summary></div>
    </div>
    <div class="hidden px-5 pt-3" data-alert-filter></div>
    <div class="scroll-thin mt-3 max-h-[560px] min-h-0 flex-1 overflow-y-auto border-t border-hairline xl:max-h-none" data-alert-body></div>
    <p class="hidden border-t border-hairline px-5 py-2.5 text-mid-gray" data-alert-more></p>`;

  const $ = (sel) => root.querySelector(sel);
  const body = $('[data-alert-body]');

  function render() {
    const { alerts, ctx } = state;
    const count = (sev) => alerts.filter((a) => a.severity === sev).length;
    const critical = count('critical');
    const warning = count('warning');

    $('[data-alert-summary]').innerHTML = [
      critical && `<span class="badge badge-alert">${critical} kritis</span>`,
      warning && `<span class="badge badge-outline">${warning} perhatian</span>`,
    ]
      .filter(Boolean)
      .join('');

    // Filter hanya muncul bila ada dua tingkat dan daftarnya cukup panjang untuk perlu disaring.
    const groupsAll = groupAlerts(alerts);
    const showFilter = critical && warning && groupsAll.length > 2;
    if (!showFilter) state.filter = 'all';
    const filterBox = $('[data-alert-filter]');
    filterBox.classList.toggle('hidden', !showFilter);
    filterBox.innerHTML = showFilter
      ? `<div class="segmented w-full" role="tablist" aria-label="Saring peringatan">
          ${[['all', `Semua (${alerts.length})`], ['critical', `Kritis (${critical})`], ['warning', `Perhatian (${warning})`]]
            .map(([v, l]) => `<button type="button" role="tab" class="flex-1" data-filter="${v}" aria-selected="${state.filter === v}">${l}</button>`)
            .join('')}
        </div>`
      : '';

    const scroll = body.scrollTop;
    if (!alerts.length) {
      body.innerHTML = clearHtml(ctx.checks, ctx.checkedAt);
      $('[data-alert-more]').classList.add('hidden');
    } else {
      const groups = groupsAll.filter((g) => state.filter === 'all' || g.severity === state.filter);
      const visible = state.showAll ? groups : groups.slice(0, GROUP_LIMIT);
      const hidden = groups.length - visible.length;
      body.innerHTML = `<ul class="divide-y divide-hairline">${visible.map((g) => groupHtml(g, state.expanded.has(g.key))).join('')}</ul>
        ${hidden ? `<button type="button" class="w-full cursor-pointer border-t border-hairline px-5 py-3 text-left font-medium transition-colors hover:bg-canvas" data-show-all>Tampilkan ${hidden} jenis peringatan lainnya</button>` : ''}`;
      body.scrollTop = scroll;
    }
    renderIcons(root);
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
    if (expand) {
      const key = expand.dataset.expand;
      state.expanded.has(key) ? state.expanded.delete(key) : state.expanded.add(key);
      return render();
    }
    if (e.target.closest('[data-show-all]')) {
      state.showAll = true;
      return render();
    }
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      state.filter = filter.dataset.filter;
      body.scrollTop = 0;
      render();
    }
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
