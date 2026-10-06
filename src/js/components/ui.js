// Potongan UI kecil yang dipakai lintas halaman.
import { esc } from '../utils/dom.js';
import { icon } from './icons.js';

/** Stat tile: label caps, angka besar, keterangan. Wadah: .stat-strip */
export function statTile({ label, value, unit = '', sub = '' }) {
  return `
    <div class="flex flex-col gap-1 bg-paper p-5">
      <span class="label-caps truncate">${esc(label)}</span>
      <div class="stat-value">${esc(value)}<span class="ml-0.5 text-body font-medium text-mid-gray">${esc(unit)}</span></div>
      ${sub ? `<p class="truncate text-caption tracking-normal text-mid-gray">${esc(sub)}</p>` : ''}
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
