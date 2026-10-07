// Potongan UI kecil yang dipakai lintas halaman.
import { COLORS } from '../theme.js';
import { esc } from '../utils/dom.js';
import { icon } from './icons.js';

/** Stat tile: label caps, angka besar, keterangan. Wadah: .stat-strip. `href` membuat tile bisa diklik. */
export function statTile({ label, value, unit = '', sub = '', href = null, alert = false }) {
  const tag = href ? 'a' : 'div';
  return `
    <${tag} ${href ? `href="${esc(href)}"` : ''} class="flex flex-col gap-1 bg-paper p-5 ${href ? 'transition-colors hover:bg-surface-alt' : ''}">
      <span class="label-caps truncate">${esc(label)}</span>
      <div class="stat-value ${alert ? 'text-ember' : ''}">${esc(value)}<span class="ml-0.5 text-body font-medium text-mid-gray">${esc(unit)}</span></div>
      ${sub ? `<p class="truncate text-caption tracking-normal text-mid-gray">${esc(sub)}</p>` : ''}
    </${tag}>`;
}

/**
 * Daftar batang horizontal untuk perbandingan sedikit kategori (≤ 8).
 * bars: [{ label, value, display?, sub? }]. Nilai ditulis di samping batang, bukan di dalamnya.
 */
export function barListHtml(bars, { format = String, max = null } = {}) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  return `<ul class="space-y-3">${bars
    .map((b) => {
      const pct = Math.max(0, Math.min(100, (b.value / top) * 100));
      return `<li title="${esc(`${b.label}: ${b.display ?? format(b.value)}`)}">
        <div class="flex items-baseline justify-between gap-3">
          <span class="min-w-0 truncate">${esc(b.label)}${b.sub ? ` <span class="text-mid-gray">${esc(b.sub)}</span>` : ''}</span>
          <span class="shrink-0 font-medium tabular-nums">${esc(b.display ?? format(b.value))}</span>
        </div>
        <div class="mt-1.5 h-2 rounded-full bg-canvas"><div class="h-2 rounded-full bg-ink" style="width:${pct.toFixed(1)}%"></div></div>
      </li>`;
    })
    .join('')}</ul>`;
}

/**
 * Satu cincin SVG: angka utama di tengah, busur = `ratio` (0–1). `alert` = warna peringatan.
 * Teks di luar cincin (nama, keterangan) diletakkan pemanggil.
 */
export function ringSvg({ value, unit, ratio, alert = false, label = '', className = 'w-full max-w-32' }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const part = Math.max(0, Math.min(1, ratio));
  const color = alert ? COLORS.ember : COLORS.ink;
  return `<svg viewBox="0 0 100 100" class="${className}" role="img" aria-label="${esc(label || `${value} ${unit}`)}">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="${COLORS.canvas}" stroke-width="8"/>
      ${part > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(c * part).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}
      <text x="50" y="52" text-anchor="middle" font-size="24" font-weight="600" fill="${color}" font-family="Inter, system-ui, sans-serif">${esc(value)}</text>
      <text x="50" y="66" text-anchor="middle" font-size="9" fill="${COLORS.muted}" font-family="Inter, system-ui, sans-serif">${esc(unit)}</text>
    </svg>`;
}

/** Judul bagian di halaman, dengan tautan opsional di kanan. */
export function sectionHeadHtml({ title, id = null, desc = '', href = null, linkLabel = 'Lihat detail' }) {
  return `<div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h2 ${id ? `id="${esc(id)}"` : ''} class="text-heading-sm font-semibold">${esc(title)}</h2>
        ${desc ? `<p class="text-mid-gray">${esc(desc)}</p>` : ''}
      </div>
      ${href ? `<a href="${esc(href)}" class="btn btn-secondary btn-sm">${esc(linkLabel)}</a>` : ''}
    </div>`;
}

/**
 * Sel nama lantai + baris status target listrik jam berjalan, untuk tabel "Per lantai".
 * f = baris dari energyByFloor(). Status ditulis dengan kata, bukan hanya warna.
 */
export function floorTargetCell(f, { href = null, fmt = String } = {}) {
  const name = href ? `<a href="${esc(href)}" class="font-medium hover:underline">${esc(f.floor.name)}</a>` : `<span class="font-medium">${esc(f.floor.name)}</span>`;
  const status = f.anomaly
    ? `<span class="font-medium text-ember" title="Jam ini ${fmt(f.currentHour)} kWh, target ${fmt(f.targetHour)} kWh">Di atas target +${Math.round((f.currentHour / f.targetHour - 1) * 100)}%</span>`
    : 'Sesuai target';
  return `${name}<span class="block text-[13px] whitespace-nowrap text-mid-gray">${status}</span>`;
}

export function segmentedHtml(options, selected, attr) {
  return options
    .map((o) => `<button type="button" role="tab" ${attr}="${esc(o.value)}" aria-selected="${o.value === selected}">${esc(o.label)}</button>`)
    .join('');
}

export function errorState(message) {
  return `<div class="flex items-center gap-2 rounded-nested border border-hairline px-3 py-3 text-ember">${icon('triangle-alert', 'size-4')}${esc(message)}</div>`;
}
