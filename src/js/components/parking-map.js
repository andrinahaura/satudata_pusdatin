// Peta slot parkir per zona (SVG). Slot terisi = blok gelap, kosong = garis tipis,
// slot khusus = arsir. Identitas tidak hanya dari warna: ada nomor & pola.
import { VEHICLE_TYPES } from '../data/device-types.js';
import { createTooltip, esc } from '../utils/dom.js';
import { fmtTime } from '../utils/format.js';

const C = { ink: '#171717', paper: '#ffffff', line: '#d4d4d4', muted: '#737373', canvas: '#f5f5f5', alt: '#fafafa' };

function slotGeometry(zone) {
  const car = zone.kind === 'car';
  return { w: car ? 44 : 26, h: car ? 76 : 46, gap: 4, lane: car ? 56 : 36 };
}

export function parkingZoneSvg(zone) {
  const g = slotGeometry(zone);
  const width = zone.cols * (g.w + g.gap) - g.gap + 32;
  // Baris berpasangan (punggung ketemu punggung) dengan jalur kendaraan di antaranya.
  const rowY = [];
  const lanes = [];
  let y = 8;
  const lane = (at) => lanes.push(`<line x1="16" x2="${width - 16}" y1="${at}" y2="${at}" stroke="${C.line}" stroke-dasharray="10 8"/>`);
  for (let r = 0; r < zone.rows; r++) {
    if (r % 2 === 0) {
      lane(y + g.lane / 2);
      y += g.lane;
    } else {
      y += g.gap;
    }
    rowY.push(y);
    y += g.h;
  }
  if (zone.rows % 2 === 0) {
    lane(y + g.lane / 2);
    y += g.lane;
  }
  const height = y + 8;

  const slots = zone.slots
    .map((s, i) => {
      const r = Math.floor(i / zone.cols);
      const c = i % zone.cols;
      const x = 16 + c * (g.w + g.gap);
      const yy = rowY[r];
      const num = s.id.split('-')[1];
      let fill = C.paper;
      let stroke = C.line;
      if (s.reserved && !s.occupied) fill = 'url(#pk-hatch)';
      if (s.occupied) {
        fill = C.ink;
        stroke = C.ink;
      }
      const textFill = s.occupied ? C.paper : C.muted;
      const tag = s.reserved === 'disabilitas' ? 'D' : s.reserved === 'pimpinan' ? 'P' : '';
      return `<g data-slot="${s.id}" class="cursor-pointer">
        <rect x="${x}" y="${yy}" width="${g.w}" height="${g.h}" rx="6" fill="${fill}" stroke="${stroke}"/>
        <text x="${x + g.w / 2}" y="${yy + g.h / 2 + 4}" text-anchor="middle" font-size="${zone.kind === 'car' ? 12 : 10}" fill="${textFill}">${tag || num}</text>
      </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="block h-auto w-full" style="min-width:${Math.min(width, 640)}px" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Peta slot ${esc(zone.name)}">
    <defs>
      <pattern id="pk-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="${C.alt}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.line}" stroke-width="2"/>
      </pattern>
    </defs>
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="${C.canvas}"/>
    ${lanes.join('')}${slots}
  </svg>`;
}

export function parkingLegendHtml() {
  const item = (svg, label) => `<span class="inline-flex items-center gap-1.5">${svg}${label}</span>`;
  const box = (fill, stroke) => `<svg width="14" height="18" aria-hidden="true"><rect x="0.5" y="0.5" width="13" height="17" rx="3" fill="${fill}" stroke="${stroke}"/></svg>`;
  return `<div class="flex flex-wrap gap-x-4 gap-y-2 text-caption tracking-normal text-mid-gray">
    ${item(box(C.ink, C.ink), 'Terisi')}
    ${item(box(C.paper, C.line), 'Kosong')}
    ${item(`<svg width="14" height="18" aria-hidden="true"><defs><pattern id="lg-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${C.line}" stroke-width="2"/></pattern></defs><rect x="0.5" y="0.5" width="13" height="17" rx="3" fill="url(#lg-h)" stroke="${C.line}"/></svg>`, 'Khusus (D: disabilitas, P: pimpinan)')}
  </div>`;
}

export function createParkingMap(container) {
  container.classList.add('relative');
  container.innerHTML = '<div class="scroll-thin overflow-x-auto" data-pk-scroll></div>';
  const scroll = container.querySelector('[data-pk-scroll]');
  const tooltip = createTooltip(container);
  let zone = null;

  scroll.addEventListener('pointermove', (e) => {
    const el = e.target.closest('[data-slot]');
    if (!el || !zone) return tooltip.hide();
    const s = zone.slots.find((x) => x.id === el.dataset.slot);
    const reserved = s.reserved ? ` · khusus ${s.reserved}` : '';
    const body = s.occupied
      ? `${VEHICLE_TYPES[s.vehicleType]?.label ?? 'Kendaraan'} · ${esc(s.plate)}<br><span class="opacity-70">Parkir sejak ${fmtTime(s.since)}</span>`
      : '<span class="opacity-70">Kosong</span>';
    tooltip.show(`<div class="font-medium">Slot ${esc(s.id)}${reserved}</div>${body}`, e);
  });
  scroll.addEventListener('pointerleave', () => tooltip.hide());

  return {
    update(next) {
      zone = next;
      scroll.innerHTML = parkingZoneSvg(next);
    },
  };
}
