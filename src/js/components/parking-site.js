// Ringkasan gedung parkir yang dipantau (saat ini Smart Parking):
// cincin ruang parkir tersedia, status, dan angka terisi / kapasitas / okupansi.
// Dipakai kartu "Ruang Parkir Tersedia" di AI Vision.
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
  const unit = (v) => `${v}<span class="text-body font-normal text-mid-gray"> ruang</span>`;
  return `
    <div class="flex flex-col items-center ${row ? 'gap-6 sm:flex-row' : 'gap-4'}">
      ${ringSvg({ value: p.free, unit: 'ruang tersedia', ratio: s.ratio, alert: s.alert, label: `${p.free} dari ${p.total} ruang parkir tersedia`, className: row ? 'w-40 shrink-0' : 'w-28 shrink-0' })}
      <div class="w-full min-w-0">
        <div class="flex flex-wrap items-center gap-2 ${row ? '' : 'justify-center'}">
          <p class="text-body-lg font-semibold">${p.free} dari ${p.total} ruang parkir tersedia</p>
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

/** "Parkir susun · 8 gerbang · 24 slot per gerbang" (Smart Parking) atau "Parkir biasa · 2 lantai". */
export function zoneKind(z) {
  const gates = gateCount(z);
  const type = z.type === 'smart' ? 'Parkir susun' : ZONE_TYPES[z.type] ?? 'Parkir';
  return gates ? `${type} · ${gates} gerbang · ${z.slotsPerGate} slot per gerbang` : `${type} · ${z.levels} lantai`;
}

/** Isi tooltip satu gerbang (3D dan 2D). t = satu menara dari summarizeParking().zones[].towers. */
export const towerTooltip = (t) => `<div class="px-1.5 py-1">
    <p class="text-caption tracking-normal text-paper">Gerbang ${t.code}</p>
    <p class="flex items-baseline gap-1.5"><span class="text-heading font-semibold tabular-nums text-accent">${t.free}</span><span class="text-body text-paper">dari ${t.total} slot tersedia</span></p>
  </div>`;

/* Ilustrasi menara dipakai SVG 2D dan canvas 3D. Tiap tingkat punya dua slot dengan lift di tengah, jadi 24 slot
   = 12 tingkat. Slot tersedia digambar sebagai mobil hijau dan jumlahnya tertulis di pintu gerbang, slot terisi
   tertutup panel. Yang diketahui hanya jumlah per gerbang, bukan letak slot, jadi mobil dikelompokkan di atas. */

export const CAR_COLOR = '#16a34a';
export const CAR_BOX = { w: 20, h: 15 };
// Mobil tampak belakang seperti sedang parkir: atap, kaca belakang, lampu, plat nomor, dua roda.
export const CAR_PATH = 'M4.2 1.6C4.5 .9 5.1 .5 5.9 .5H14.1C14.9 .5 15.5 .9 15.8 1.6L17.4 5.6C18.6 6 19.4 7 19.4 8.2V11.6C19.4 12.2 19 12.6 18.4 12.6H1.6C1 12.6 .6 12.2 .6 11.6V8.2C.6 7 1.4 6 2.6 5.6ZM6.3 2.1 5 5.4H15L13.7 2.1ZM2.8 7.6V9.4H5.8V7.6ZM14.2 7.6V9.4H17.2V7.6ZM7.6 9V11H12.4V9ZM2 13H5.2V14.2C5.2 14.5 4.9 14.8 4.6 14.8H2.6C2.3 14.8 2 14.5 2 14.2ZM14.8 13H18V14.2C18 14.5 17.7 14.8 17.4 14.8H15.4C15.1 14.8 14.8 14.5 14.8 14.2Z';

export const CARS_PER_ROW = 2;

/** Jumlah tingkat yang terpakai oleh `free` mobil. */
export const carRows = (free) => Math.ceil(free / CARS_PER_ROW);

/** Jumlah tingkat gedung: tiap tingkat berisi dua slot. */
export const levelsOf = (z) => carRows(z.slotsPerGate);

/* Warna gedung untuk ilustrasi 3D dan 2D. */

export const FACADE = { wall: '#f7f8fa', slab: '#e3e6ec', closed: '#c9d0dd', side: '#aeb5c2', steel: '#2c3f73', deck: '#d7dce6', spine: '#39435c', door: '#172650' };

/** Lebar muka gedung dalam kolom: 2 kolom per gerbang, minimal 8. */
export const facadeCols = (gates) => Math.max(8, gates * 2);
