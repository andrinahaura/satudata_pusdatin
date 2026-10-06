// Potongan UI kecil yang dipakai lintas halaman.
import { esc } from '../utils/dom.js';
import { icon } from './icons.js';

/** Stat tile: label caps, angka besar, keterangan. */
export function statTile({ label, value, unit = '', sub = '', iconName }) {
  return `
    <div class="card flex flex-col gap-1 p-5">
      <div class="flex items-center justify-between gap-2">
        <span class="label-caps truncate">${esc(label)}</span>
        ${iconName ? icon(iconName, 'size-4 shrink-0 text-mid-gray') : ''}
      </div>
      <div class="stat-value">${esc(value)}<span class="ml-0.5 text-body font-medium text-mid-gray">${esc(unit)}</span></div>
      <p class="truncate text-caption tracking-normal text-mid-gray">${esc(sub)}</p>
    </div>`;
}

/** Bar progres tipis untuk rasio 0..1. */
export function meter(ratio, label = '') {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return `<div class="h-1.5 overflow-hidden rounded-full bg-canvas" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(label)}">
    <div class="h-full rounded-full bg-ink transition-[width] duration-500" style="width:${pct}%"></div>
  </div>`;
}

const SEVERITY = {
  critical: { badge: 'badge-alert', label: 'Kritis' },
  warning: { badge: 'badge-outline', label: 'Perhatian' },
  info: { badge: 'badge-soft', label: 'Info' },
};

export function alertListHtml(alerts, limit = 6) {
  if (!alerts.length) {
    return `<div class="flex items-center gap-2 rounded-nested bg-canvas px-3 py-3 text-mid-gray">${icon('circle-check', 'size-4')}Tidak ada peringatan aktif.</div>`;
  }
  const rows = alerts
    .slice(0, limit)
    .map((a) => {
      const sev = SEVERITY[a.severity];
      return `<li>
        <a href="${esc(a.href)}" class="flex items-start gap-3 rounded-nested px-2 py-2.5 transition-colors hover:bg-canvas">
          <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-hairline ${a.severity === 'critical' ? 'text-ember' : 'text-ink'}">${icon(a.icon, 'size-4')}</span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center justify-between gap-2"><span class="truncate font-medium">${esc(a.title)}</span><span class="badge ${sev.badge}">${sev.label}</span></span>
            <span class="block truncate text-caption tracking-normal text-mid-gray">${esc(a.meta)}</span>
          </span>
        </a>
      </li>`;
    })
    .join('');
  const more = alerts.length > limit ? `<p class="px-2 pt-2 text-caption tracking-normal text-mid-gray">+${alerts.length - limit} peringatan lainnya</p>` : '';
  return `<ul class="-mx-2">${rows}</ul>${more}`;
}

export function segmentedHtml(options, selected, attr) {
  return options
    .map((o) => `<button type="button" role="tab" ${attr}="${esc(o.value)}" aria-selected="${o.value === selected}">${esc(o.label)}</button>`)
    .join('');
}

export function errorState(message) {
  return `<div class="flex items-center gap-2 rounded-nested border border-hairline px-3 py-3 text-ember">${icon('triangle-alert', 'size-4')}${esc(message)}</div>`;
}
