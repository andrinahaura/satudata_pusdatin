// Ringkasan satu lokasi parkir (saat ini piloting Smart Parking, parkir susun):
// cincin slot tersedia, status, dan angka terisi / kapasitas / okupansi.
// Dipakai kartu "Slot tersedia" di Home dan AI Vision supaya tampilannya sama.
import { esc } from '../utils/dom.js';
import { fmtPct, fmtTime } from '../utils/format.js';
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

/** Isi tooltip satu slot di ilustrasi parkir susun (3D dan 2D). Slot ke-i ada di tingkat floor(i / cols) + 1. */
export function slotTooltip(zone, slotId) {
  const i = zone.slots.findIndex((x) => x.id === slotId);
  const s = zone.slots[i];
  const level = Math.floor(i / zone.cols) + 1;
  const body = s.occupied
    ? `Mobil · <span class="font-mono">${esc(s.plate)}</span><br><span class="opacity-70">Parkir sejak ${fmtTime(s.since)}</span>`
    : '<span class="opacity-70">Kosong</span>';
  return `<div class="font-medium">Slot ${esc(s.id.split('-')[1])} · Tingkat ${level}</div>${body}`;
}
