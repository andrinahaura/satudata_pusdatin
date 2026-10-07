// Ilustrasi 2D Smart Parking (parkir susun), tampak depan: tingkat tertinggi di atas,
// satu kotak per slot. Slot terisi = kotak navy dengan siluet mobil, kosong = garis tipis + nomor.
// Identitas tidak hanya dari warna: slot kosong selalu bernomor, slot terisi bersiluet mobil.
import { COLORS as C } from '../theme.js';
import { createTooltip, esc } from '../utils/dom.js';
import { slotTooltip } from './parking-site.js';

const BAY_W = 72;
const BAY_H = 52;
const GAP = 6;
const LABEL_W = 84; // kolom label tingkat di kiri

// Siluet mobil tampak depan, digambar di dalam kotak slot.
function carShape(x, y) {
  const cx = x + BAY_W / 2;
  const base = y + BAY_H - 12;
  return `<path d="M${cx - 24} ${base} v-9 q0-5 5-6 l5-9 q2-4 7-4 h14 q5 0 7 4 l5 9 q5 1 5 6 v9 z" fill="${C.paper}" opacity="0.9"/>
    <rect x="${cx - 21}" y="${base}" width="8" height="5" rx="2" fill="${C.paper}" opacity="0.9"/>
    <rect x="${cx + 13}" y="${base}" width="8" height="5" rx="2" fill="${C.paper}" opacity="0.9"/>`;
}

export function parkingRackSvg(zone) {
  const width = LABEL_W + zone.cols * (BAY_W + GAP) - GAP + 16;
  const rackH = zone.rows * (BAY_H + GAP) - GAP;
  const height = 16 + rackH + 40;
  const rows = [];
  for (let level = zone.rows - 1; level >= 0; level--) {
    const y = 16 + (zone.rows - 1 - level) * (BAY_H + GAP);
    rows.push(`<text x="12" y="${y + BAY_H / 2 + 4}" font-size="12" font-weight="500" fill="${C.muted}">Tingkat ${level + 1}</text>`);
    for (let col = 0; col < zone.cols; col++) {
      const s = zone.slots[level * zone.cols + col];
      if (!s) continue;
      const x = LABEL_W + col * (BAY_W + GAP);
      const num = s.id.split('-')[1];
      rows.push(`<g data-slot="${esc(s.id)}" class="cursor-pointer">
        <rect x="${x}" y="${y}" width="${BAY_W}" height="${BAY_H}" rx="8" fill="${s.occupied ? C.ink : C.paper}" stroke="${s.occupied ? C.ink : C.line}"/>
        ${s.occupied ? carShape(x, y) : `<text x="${x + BAY_W / 2}" y="${y + BAY_H / 2 + 4}" text-anchor="middle" font-size="12" fill="${C.muted}">${esc(num)}</text>`}
      </g>`);
    }
  }
  const groundY = 16 + rackH + 10;
  const rackX = LABEL_W - 8;
  const rackW = zone.cols * (BAY_W + GAP) - GAP + 16;
  return `<svg viewBox="0 0 ${width} ${height}" class="block h-auto w-full" style="min-width:${Math.min(width, 620)}px" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Ilustrasi slot ${esc(zone.name)}">
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="${C.canvas}"/>
    <rect x="${rackX}" y="8" width="${rackW}" height="${rackH + 16}" rx="10" fill="none" stroke="${C.line}"/>
    ${rows.join('')}
    <line x1="${rackX}" x2="${rackX + rackW}" y1="${groundY + 6}" y2="${groundY + 6}" stroke="${C.line}" stroke-width="2"/>
    <text x="${rackX + rackW / 2}" y="${groundY + 22}" text-anchor="middle" font-size="11" fill="${C.muted}">Jalur masuk · gerbang ALPR</text>
  </svg>`;
}

export function parkingLegendHtml() {
  const box = (fill, stroke) => `<svg width="18" height="14" aria-hidden="true"><rect x="0.5" y="0.5" width="17" height="13" rx="3" fill="${fill}" stroke="${stroke}"/></svg>`;
  const item = (svg, label) => `<span class="inline-flex items-center gap-1.5">${svg}${label}</span>`;
  return `<div class="flex flex-wrap gap-x-4 gap-y-2 text-caption tracking-normal text-mid-gray">
    ${item(box(C.ink, C.ink), 'Terisi')}
    ${item(box(C.paper, C.line), 'Kosong (bernomor)')}
    <span>Arahkan kursor ke slot untuk melihat nomor polisi</span>
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
    tooltip.show(slotTooltip(zone, el.dataset.slot), e);
  });
  scroll.addEventListener('pointerleave', () => tooltip.hide());

  return {
    update(next) {
      zone = next;
      scroll.innerHTML = parkingRackSvg(next);
    },
  };
}
