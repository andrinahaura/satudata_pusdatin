// Ringkasan gedung parkir yang dipantau (saat ini Smart Parking):
// cincin slot tersedia, status, dan angka terisi / kapasitas / okupansi.
// Dipakai kartu "Slot tersedia" di Home dan AI Vision supaya tampilannya sama.
import { fmtPct } from '../utils/format.js';
import { ringSvg } from './ui.js';

/** "Smart Parking · parkir susun (piloting)" dari parking.site. */
export const siteLabel = (site) => (site ? `${site.name} · ${site.kind.toLowerCase()}${site.status ? ` (${site.status.toLowerCase()})` : ''}` : '');

// Ambang "hampir penuh" sama dengan peringatan parkir di getAlerts(): sisa slot < 10%.
export function slotStatus(p) {
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

export const ZONE_TYPES = { smart: 'Smart Parking', regular: 'Parkir biasa' };

/** Jumlah gate depan + belakang, mis. 16. */
export const gateCount = (z) => (z.gates ? z.gates.front + z.gates.back : 0);

/** "Parkir susun · 11 lantai · 16 gate" (Smart Parking) atau "Parkir biasa · 2 lantai". */
export function zoneKind(z) {
  const gates = gateCount(z);
  return `${z.type === 'smart' ? 'Parkir susun' : ZONE_TYPES[z.type] ?? 'Parkir'} · ${z.levels} lantai${gates ? ` · ${gates} gate` : ''}`;
}

/** Isi tooltip satu gedung parkir (3D dan 2D): hanya jumlah slot tersedia, angka besar agar mudah dibaca. z = satu zona dari summarizeParking(). */
export const zoneTooltip = (z) => `<div class="flex items-center gap-2.5 px-1.5 py-1">
    <span class="text-heading font-semibold tabular-nums text-accent">${z.free}</span>
    <span class="text-body leading-tight text-paper">slot<br>tersedia</span>
  </div>`;

/* Fasad gedung untuk ilustrasi 3D dan 2D, mengikuti Smart Parking: dinding putih, jalur kaca vertikal,
   dan panel tanaman berselang-seling (pola papan catur) di tiap lantai. Lantai dasar berisi gate. */

export const FACADE = { wall: '#f7f8fa', glass: '#9fb2c6', plant: '#6f8443', plantDark: '#4f6331', slab: '#e3e6ec' };

/** Lebar fasad dalam kolom panel: 2 kolom per gate, minimal 8. */
export const facadeCols = (gates) => Math.max(8, gates * 2);

/**
 * Sel fasad untuk `rows` lantai di atas lantai dasar: kolom kaca tiap kolom ke-5 (mulai kolom 2),
 * panel tanaman di sel (baris + kolom) genap selain kolom kaca. Baris 0 = lantai teratas.
 */
export function facadeCells(cols, rows) {
  const glass = Array.from({ length: cols }, (_, c) => c).filter((c) => c % 5 === 2);
  const plants = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0 && !glass.includes(c)) plants.push({ r, c });
  }
  return { glass, plants };
}
