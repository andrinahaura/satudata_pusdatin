// Ringkasan satu lokasi parkir (saat ini piloting Smart Parking, parkir susun):
// cincin slot tersedia, status, dan angka terisi / kapasitas / okupansi.
// Dipakai kartu "Slot tersedia" di Home dan AI Vision supaya tampilannya sama.
import { VEHICLE_TYPES } from '../data/device-types.js';
import { esc } from '../utils/dom.js';
import { fmtPct } from '../utils/format.js';
import { icon } from './icons.js';
import { ringSvg } from './ui.js';

/** "Smart Parking · parkir susun (piloting)" dari parking.site. */
export const siteLabel = (site) => (site ? `${site.name} · ${site.kind.toLowerCase()}${site.status ? ` (${site.status.toLowerCase()})` : ''}` : '');

// Ambang "hampir penuh" sama dengan peringatan parkir di getAlerts(): sisa slot < 10%.
function slotStatus(p) {
  const ratio = p.total ? p.free / p.total : 0;
  if (p.free === 0) return { ratio, alert: true, label: 'Penuh', cls: 'badge-alert' };
  if (ratio < 0.1) return { ratio, alert: true, label: 'Hampir penuh', cls: 'badge-alert' };
  return { ratio, alert: false, label: 'Tersedia', cls: 'badge-solid' };
}

/**
 * p = summarizeParking(). layout 'row' (cincin di kiri, untuk kartu lebar) atau
 * 'stack' (cincin di atas, untuk kolom sempit).
 */
export function siteSlotsHtml(p, { layout = 'row' } = {}) {
  const s = slotStatus(p);
  const row = layout === 'row';
  const fact = (label, value) => `<div><dt class="text-caption tracking-normal text-mid-gray">${label}</dt><dd class="mt-0.5 text-subheading font-semibold tabular-nums">${value}</dd></div>`;
  const unit = (v) => `${v}<span class="text-body font-normal text-mid-gray"> slot</span>`;
  return `
    <div class="flex flex-col items-center ${row ? 'gap-6 sm:flex-row' : 'gap-4'}">
      ${ringSvg({ value: p.free, unit: 'slot tersedia', ratio: s.ratio, alert: s.alert, label: `${p.free} dari ${p.total} slot tersedia`, className: row ? 'w-40 shrink-0' : 'w-28 shrink-0' })}
      <div class="w-full min-w-0">
        <div class="flex flex-wrap items-center gap-2 ${row ? '' : 'justify-center'}">
          <p class="text-body-lg font-semibold">${p.free} dari ${p.total} slot tersedia</p>
          <span class="badge ${s.cls}">${s.label}</span>
        </div>
        <dl class="mt-4 grid grid-cols-3 gap-4 border-t border-hairline pt-4">
          ${fact('Terisi', unit(p.occupied))}
          ${fact('Kapasitas', unit(p.total))}
          ${fact('Okupansi', fmtPct(p.rate))}
        </dl>
      </div>
    </div>`;
}

// Warna tetap per jenis kendaraan (urutan sama dengan VEHICLE_TYPES).
const TYPE_COLOR = { car: 'bg-ink', motorcycle: 'bg-accent', truck: 'bg-mid-gray' };
const TYPE_ICON = { car: 'car', motorcycle: 'bike', truck: 'truck' };

/**
 * Kendaraan yang sedang terparkir per jenis: satu batang komposisi lalu satu baris per jenis
 * (ikon, nama, jumlah, porsi). parked = { car, motorcycle, truck }.
 */
export function parkedByTypeHtml(parked) {
  const entries = Object.entries(VEHICLE_TYPES).map(([k, t]) => ({ key: k, label: t.label, count: parked[k] ?? 0 }));
  const total = entries.reduce((s, e) => s + e.count, 0);
  const visible = entries.filter((e) => e.count > 0);
  const bar = visible
    .map((e, i) => `<div class="${TYPE_COLOR[e.key]} ${i === 0 ? 'rounded-l-full' : ''} ${i === visible.length - 1 ? 'rounded-r-full' : ''}" style="width:${((e.count / total) * 100).toFixed(1)}%" title="${esc(e.label)}: ${e.count}"></div>`)
    .join('');
  return `
    <div class="flex h-2.5 gap-0.5 rounded-full bg-canvas" role="img" aria-label="${esc(entries.map((e) => `${e.label} ${e.count}`).join(', '))}">${bar}</div>
    <ul class="mt-3 space-y-1.5">
      ${entries
        .map((e) => `<li class="flex items-center gap-3 rounded-nested border border-hairline px-3 py-2">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-canvas text-ink">${icon(TYPE_ICON[e.key], 'size-4')}</span>
          <span class="flex min-w-0 flex-1 items-center gap-2"><span class="dot ${TYPE_COLOR[e.key]}"></span><span class="truncate font-medium">${esc(e.label)}</span></span>
          <span class="text-subheading font-semibold tabular-nums">${e.count}</span>
          <span class="w-11 text-right text-mid-gray tabular-nums">${total ? fmtPct(e.count / total) : '0%'}</span>
        </li>`)
        .join('')}
    </ul>`;
}
