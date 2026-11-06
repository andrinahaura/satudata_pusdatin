// Ilustrasi 2D gedung parkir, mengikuti Smart Parking: tampak depan dan tampak belakang berjajar.
// Tiap gerbang punya satu menara setinggi levelsOf(): dua slot per tingkat dengan lift di tengah. Slot tersedia
// berupa mobil, slot terisi tertutup. Gerbangnya di lantai dasar, jumlah slot tersedia tertulis di pintu dan
// muncul di tooltip. Gedung hampir penuh bergaris merah.
import { COLORS as C } from '../theme.js';
import { createTooltip, esc } from '../utils/dom.js';
import { CAR_BOX, CAR_COLOR, CAR_PATH, CARS_PER_ROW, carRows, FACADE, levelsOf, slotStatus, towerTooltip, zoneKind } from './parking-site.js';

const CAR_CELL = 42; // lebar satu slot
const LIFT_W = 14; // lebar lift di tengah menara
const COL_W = CAR_CELL * CARS_PER_ROW + LIFT_W; // lebar satu menara (satu gerbang)
const ROW_H = 34; // tinggi satu baris mobil
const CAR_H = 30;
const CAR_W = (CAR_H * CAR_BOX.w) / CAR_BOX.h;
const GROUND_H = 44; // lantai dasar (gerbang)
const CORNICE = 8;
const GAP = 60;
const PAD = 40;
const TOP = 30;
const BOTTOM = 62; // ruang label di bawah tanah

const SIDES = [['front', 'Tampak depan'], ['back', 'Tampak belakang']];
const towersOn = (z, side) => z.towers.filter((t) => t.side === side);
const faceWidth = (z, side) => towersOn(z, side).length * COL_W;
const zoneWidth = (z) => SIDES.reduce((s, [side]) => s + faceWidth(z, side), 0) + GAP * (SIDES.length - 1);

function tower(t, rows, x, top, groundY) {
  const cars = Array.from({ length: t.free }, (_, i) => {
    const col = i % CARS_PER_ROW;
    const row = Math.floor(i / CARS_PER_ROW);
    return `<use href="#pk-car" x="${x + col * (CAR_CELL + LIFT_W) + (CAR_CELL - CAR_W) / 2}" y="${top + row * ROW_H + (ROW_H - CAR_H) / 2}" width="${CAR_W}" height="${CAR_H}" fill="${CAR_COLOR}"/>`;
  }).join('');
  const filled = carRows(t.free);
  const panel = (px, py, w, h) => `<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${FACADE.closed}" stroke="${FACADE.wall}" stroke-width="2"/>`;
  // Garis tepi sewarna dinding menutup ujung garis lantai, jadi batas antar gerbang tetap bersih.
  const closed = [
    rows > filled ? panel(x, top + filled * ROW_H, COL_W, (rows - filled) * ROW_H) : '',
    t.free % CARS_PER_ROW ? panel(x + CAR_CELL + LIFT_W, top + (filled - 1) * ROW_H, CAR_CELL, ROW_H) : '',
  ].join('');
  // Lift: ruang luncur di tengah menara, kabin di tingkat paling bawah.
  const liftX = x + CAR_CELL;
  const liftH = rows * ROW_H;
  const lift = `<rect x="${liftX}" y="${top}" width="${LIFT_W}" height="${liftH}" fill="${FACADE.spine}"/>
    <line x1="${liftX + LIFT_W / 2}" x2="${liftX + LIFT_W / 2}" y1="${top}" y2="${top + liftH}" stroke="${FACADE.deck}" stroke-width="1"/>
    <rect x="${liftX + 2}" y="${top + liftH - ROW_H + 3}" width="${LIFT_W - 4}" height="${ROW_H - 6}" rx="1" fill="${FACADE.slab}"/>`;
  const doorY = groundY - GROUND_H + 10;
  return `<g data-gate="${esc(t.code)}" class="pk-tower">
    ${closed}${cars}${lift}
    <rect x="${x + 4}" y="${doorY}" width="${COL_W - 8}" height="${GROUND_H - 10}" rx="1" fill="${C.inkSoft}"/>
    <rect x="${x + 8}" y="${doorY - 5}" width="${COL_W - 16}" height="2.5" fill="${C.accent}"/>
    <text x="${x + COL_W / 2}" y="${doorY + (GROUND_H - 10) / 2 + 8}" text-anchor="middle" font-size="24" font-weight="700" fill="${C.paper}">${t.free}</text>
    <rect class="pk-hit" x="${x}" y="${top}" width="${COL_W}" height="${groundY - top}" fill="transparent"/>
  </g>`;
}

function face(z, side, label, x, groundY) {
  const list = towersOn(z, side);
  const W = list.length * COL_W;
  const rows = levelsOf(z);
  const top = groundY - GROUND_H - rows * ROW_H;
  const { alert } = slotStatus(z);
  const dividers = list.slice(1).map((_, i) => `<line x1="${x + (i + 1) * COL_W}" x2="${x + (i + 1) * COL_W}" y1="${top}" y2="${groundY - GROUND_H}" stroke="${FACADE.slab}"/>`).join('');
  const slabs = Array.from({ length: rows }, (_, r) => `<line x1="${x}" x2="${x + W}" y1="${top + (r + 1) * ROW_H}" y2="${top + (r + 1) * ROW_H}" stroke="${FACADE.slab}" stroke-width="1.5"/>`).join('');
  return `<g>
    <rect x="${x}" y="${top}" width="${W}" height="${groundY - top}" fill="${FACADE.wall}"/>
    <rect x="${x}" y="${groundY - GROUND_H}" width="${W}" height="${GROUND_H}" fill="${C.paper}"/>
    ${dividers}${slabs}
    <rect x="${x - 4}" y="${top - CORNICE}" width="${W + 8}" height="${CORNICE}" fill="${C.paper}" stroke="${C.line}"/>
    <rect x="${x - 4}" y="${top - CORNICE}" width="${W + 8}" height="${groundY - top + CORNICE}" fill="none" stroke="${alert ? C.ember : C.line}" stroke-width="${alert ? 2.5 : 1}"/>
    ${list.map((t, i) => tower(t, rows, x + i * COL_W, top, groundY)).join('')}
    <text x="${x + W / 2}" y="${groundY + 24}" text-anchor="middle" font-size="14" font-weight="600" fill="${alert ? C.ember : C.ink}">${esc(z.name)}</text>
    <text x="${x + W / 2}" y="${groundY + 42}" text-anchor="middle" font-size="12" fill="${C.muted}">${label}</text>
  </g>`;
}

function building(z, x, groundY) {
  let cursor = x;
  const faces = SIDES.map(([side, label]) => {
    const svg = face(z, side, label, cursor, groundY);
    cursor += faceWidth(z, side) + GAP;
    return svg;
  });
  return `<g data-zone="${esc(z.id)}">${faces.join('')}</g>`;
}

export function parkingSiteSvg({ zones }) {
  const W = PAD * 2 + zones.reduce((s, z) => s + zoneWidth(z), 0) + Math.max(0, zones.length - 1) * GAP;
  const rows = Math.max(1, ...zones.map(levelsOf));
  const groundY = TOP + CORNICE + GROUND_H + rows * ROW_H;
  const H = groundY + BOTTOM;
  let x = PAD;
  const buildings = zones.map((z) => {
    const svg = building(z, x, groundY);
    x += zoneWidth(z) + GAP;
    return svg;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="mx-auto block h-auto max-h-[620px] w-full select-none" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Ilustrasi gedung parkir, tampak depan dan belakang, satu menara slot per gerbang">
    <defs>
      <style>
        .pk-tower { cursor: pointer; }
        .pk-tower:hover .pk-hit { fill: ${C.ink}; fill-opacity: 0.08; }
      </style>
      <symbol id="pk-car" viewBox="0 0 ${CAR_BOX.w} ${CAR_BOX.h}"><path d="${CAR_PATH}" fill-rule="evenodd"/></symbol>
    </defs>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${C.canvas}"/>
    <line x1="16" x2="${W - 16}" y1="${groundY}" y2="${groundY}" stroke="${C.line}" stroke-width="2"/>
    ${buildings.join('')}
  </svg>`;
}

export function parkingLegendHtml() {
  const car = (fill) => `<svg width="16" height="12" viewBox="0 0 ${CAR_BOX.w} ${CAR_BOX.h}" aria-hidden="true"><path d="${CAR_PATH}" fill="${fill}" fill-rule="evenodd"/></svg>`;
  const box = (fill, stroke, width = 1.5) => `<svg width="18" height="14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/></svg>`;
  const item = (svg, label) => `<span class="inline-flex items-center gap-1.5">${svg}${label}</span>`;
  return `<div class="flex flex-wrap gap-x-4 gap-y-2 text-caption tracking-normal text-mid-gray">
    ${item(car(CAR_COLOR), 'Slot tersedia')}
    ${item(box(FACADE.closed, FACADE.closed), 'Slot terisi')}
    ${item(`<svg width="18" height="14" aria-hidden="true"><rect x="1" y="3" width="16" height="10" rx="1" fill="${C.inkSoft}"/><rect x="3" y="0" width="12" height="2" fill="${C.accent}"/></svg>`, 'Gerbang masuk/keluar')}
    ${item(box(C.paper, C.ember, 2.5), 'Hampir penuh')}
    <span>Angka di gerbang = jumlah slot tersedia</span>
  </div>`;
}

export function createParkingMap(container) {
  container.classList.add('relative');
  container.innerHTML = '<div class="scroll-thin overflow-x-auto" data-pk-scroll></div>';
  const scroll = container.querySelector('[data-pk-scroll]');
  const tooltip = createTooltip(container);
  let zones = [];

  scroll.addEventListener('pointermove', (e) => {
    const z = zones.find((x) => x.id === e.target.closest('[data-zone]')?.dataset.zone);
    const t = z?.towers.find((x) => x.code === e.target.closest('[data-gate]')?.dataset.gate);
    if (!t) return tooltip.hide();
    tooltip.show(towerTooltip(t), e);
  });
  scroll.addEventListener('pointerleave', () => tooltip.hide());

  return {
    /** @param {{ zones: object[] }} next zones = summarizeParking().zones */
    update(next) {
      zones = next.zones;
      scroll.innerHTML = parkingSiteSvg(next);
    },
  };
}
