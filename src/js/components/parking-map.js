// Ilustrasi 2D gedung parkir, tampak depan, mengikuti Smart Parking: zone.levels lantai, fasad putih
// dengan jalur kaca dan panel tanaman, gate depan di lantai dasar. Bila ada lebih
// dari satu gedung, gedung berjajar (bukan peta lokasi). Isi gedung dan letak slot tidak digambar;
// jumlah slot tersedia muncul di tooltip. Gedung hampir penuh bergaris merah dan namanya merah.
import { COLORS as C } from '../theme.js';
import { createTooltip, esc } from '../utils/dom.js';
import { FACADE, facadeCells, facadeCols, slotStatus, zoneKind, zoneTooltip } from './parking-site.js';

const COL_W = 22; // lebar satu kolom panel (satu gate = 2 kolom)
const FLOOR_H = 34; // tinggi satu lantai di atas lantai dasar
const GROUND_H = 44; // lantai dasar (gate)
const CORNICE = 8;
const GAP = 60;
const PAD = 40;
const TOP = 30;
const BOTTOM = 62; // ruang label di bawah tanah

const gatesOf = (z) => z.gates ?? { front: 4, back: 4 };
const widthOf = (z) => facadeCols(gatesOf(z).front) * COL_W;

function building(z, x, groundY) {
  const W = widthOf(z);
  const upper = z.levels - 1;
  const top = groundY - GROUND_H - upper * FLOOR_H;
  const { alert } = slotStatus(z);
  const { glass, plants } = facadeCells(facadeCols(gatesOf(z).front), upper);
  const n = gatesOf(z).front;
  const gw = W / n;

  const glassSvg = glass.map((c) => `<rect x="${x + c * COL_W + 5}" y="${top}" width="${COL_W - 10}" height="${upper * FLOOR_H}" fill="${FACADE.glass}"/>`).join('');
  const plantSvg = plants
    .map(({ r, c }) => {
      const px = x + c * COL_W + 4;
      const py = top + r * FLOOR_H;
      return `<rect x="${px}" y="${py + 4}" width="${COL_W - 8}" height="12" fill="${FACADE.plantDark}"/><rect x="${px}" y="${py + 19}" width="${COL_W - 8}" height="12" fill="${FACADE.plantDark}"/>
        <rect x="${px + 2}" y="${py + 6}" width="${COL_W - 12}" height="6" fill="${FACADE.plant}"/><rect x="${px + 2}" y="${py + 21}" width="${COL_W - 12}" height="6" fill="${FACADE.plant}"/>`;
    })
    .join('');
  const floors = Array.from({ length: upper - 1 }, (_, i) => `<line x1="${x}" x2="${x + W}" y1="${top + (i + 1) * FLOOR_H}" y2="${top + (i + 1) * FLOOR_H}" stroke="${FACADE.slab}" stroke-width="2"/>`).join('');
  const gates = Array.from({ length: n }, (_, i) => {
    const gx = x + i * gw;
    return `<rect x="${gx + 4}" y="${groundY - GROUND_H + 10}" width="${gw - 8}" height="${GROUND_H - 10}" rx="1" fill="${C.inkSoft}"/>
      <rect x="${gx + 8}" y="${groundY - GROUND_H + 5}" width="${gw - 16}" height="2.5" fill="${C.accent}"/>`;
  }).join('');

  return `<g data-zone="${esc(z.id)}" class="pk-zone">
    <rect x="${x}" y="${top}" width="${W}" height="${groundY - top}" fill="${FACADE.wall}"/>
    ${glassSvg}${plantSvg}${floors}
    <rect x="${x - 4}" y="${top - CORNICE}" width="${W + 8}" height="${CORNICE}" fill="${C.paper}" stroke="${C.line}"/>
    <rect x="${x}" y="${groundY - GROUND_H}" width="${W}" height="${GROUND_H}" fill="${C.paper}"/>
    ${gates}
    <rect x="${x - 4}" y="${top - CORNICE}" width="${W + 8}" height="${groundY - top + CORNICE}" fill="none" stroke="${alert ? C.ember : C.line}" stroke-width="${alert ? 2.5 : 1}"/>
    <text x="${x + W / 2}" y="${groundY + 24}" text-anchor="middle" font-size="14" font-weight="600" fill="${alert ? C.ember : C.ink}">${esc(z.name)}</text>
    <text x="${x + W / 2}" y="${groundY + 42}" text-anchor="middle" font-size="12" fill="${C.muted}">${zoneKind(z)}</text>
  </g>`;
}

export function parkingSiteSvg({ zones }) {
  const W = PAD * 2 + zones.reduce((s, z) => s + widthOf(z), 0) + Math.max(0, zones.length - 1) * GAP;
  const groundY = TOP + CORNICE + GROUND_H + Math.max(1, ...zones.map((z) => z.levels - 1)) * FLOOR_H;
  const H = groundY + BOTTOM;
  let x = PAD;
  const buildings = zones.map((z) => {
    const svg = building(z, x, groundY);
    x += widthOf(z) + GAP;
    return svg;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="mx-auto block h-auto max-h-[620px] w-full select-none" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Ilustrasi gedung parkir, tampak depan">
    <defs><style>
      .pk-zone { cursor: pointer; }
    </style></defs>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${C.canvas}"/>
    <line x1="16" x2="${W - 16}" y1="${groundY}" y2="${groundY}" stroke="${C.line}" stroke-width="2"/>
    ${buildings.join('')}
  </svg>`;
}

export function parkingLegendHtml() {
  const box = (fill, stroke, width = 1.5) => `<svg width="18" height="14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/></svg>`;
  const item = (svg, label) => `<span class="inline-flex items-center gap-1.5">${svg}${label}</span>`;
  return `<div class="flex flex-wrap gap-x-4 gap-y-2 text-caption tracking-normal text-mid-gray">
    ${item(`<svg width="18" height="14" aria-hidden="true"><rect x="1" y="3" width="16" height="10" rx="1" fill="${C.inkSoft}"/><rect x="3" y="0" width="12" height="2" fill="${C.accent}"/></svg>`, 'Gate masuk/keluar')}
    ${item(box(C.paper, C.ember, 2.5), 'Hampir penuh')}
    <span>Arahkan kursor ke gedung untuk melihat slot tersedia</span>
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
    if (!z) return tooltip.hide();
    tooltip.show(zoneTooltip(z), e);
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
