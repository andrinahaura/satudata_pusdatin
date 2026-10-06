// Denah lantai interaktif (SVG). Koordinat ruangan & perangkat mengikuti viewBox 1000 x 560
// yang dikirim backend/mock (room.x/y/w/h, device.x/y).
import { DEVICE_TYPES } from '../data/device-types.js';
import { createTooltip, esc } from '../utils/dom.js';
import { fmt1 } from '../utils/format.js';

const C = {
  ink: '#0a0a0a',
  paper: '#ffffff',
  canvas: '#f5f5f5',
  alt: '#fafafa',
  line: '#d4d4d4',
  hairline: '#e5e5e5',
  off: '#a3a3a3',
  muted: '#737373',
  ember: '#e7000b',
};

function deviceState(d) {
  if (!d.online) return 'offline';
  return d.on ? 'on' : 'off';
}

function markerStyle(state) {
  if (state === 'offline') return `fill="${C.ember}" stroke="${C.paper}" stroke-width="2"`;
  if (state === 'on') return `fill="${C.ink}" stroke="${C.paper}" stroke-width="2"`;
  return `fill="${C.paper}" stroke="${C.off}" stroke-width="1.5"`;
}

// Bentuk berbeda per tipe supaya identitas tidak bergantung pada warna.
export function markerShape(type, x, y, attrs) {
  switch (type) {
    case 'light':
      return `<circle cx="${x}" cy="${y}" r="6.5" ${attrs}/>`;
    case 'ac':
      return `<rect x="${x - 9}" y="${y - 5.5}" width="18" height="11" rx="3" ${attrs}/>`;
    case 'sensor':
      return `<rect x="${x - 5.5}" y="${y - 5.5}" width="11" height="11" rx="2" transform="rotate(45 ${x} ${y})" ${attrs}/>`;
    case 'cctv':
      return `<path d="M${x} ${y - 7} L${x + 7.5} ${y + 6} L${x - 7.5} ${y + 6} Z" stroke-linejoin="round" ${attrs}/>`;
    case 'lock':
      return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="3" ${attrs}/><rect x="${x - 1}" y="${y - 2.5}" width="2" height="5" rx="1" fill="${C.paper}"/>`;
    default:
      return '';
  }
}

function roomTile(room, selected) {
  const x = room.x + 3;
  const y = room.y + 3;
  const w = room.w - 6;
  const h = room.h - 6;
  const interactive = room.type !== 'corridor';
  let fill = C.paper;
  if (room.type === 'corridor') fill = C.canvas;
  if (room.type === 'core' || room.type === 'toilet') fill = 'url(#fp-hatch)';
  const stroke = selected ? C.ink : room.type === 'corridor' ? 'none' : C.line;
  const sw = selected ? 1.75 : 1;

  let extra = '';
  if (room.type === 'core') {
    // Simbol lift: kotak dengan silang.
    const cx = x + w / 2;
    const cy = y + h / 2 + 10;
    extra = `<rect x="${cx - 26}" y="${cy - 26}" width="52" height="52" rx="6" fill="${C.paper}" stroke="${C.line}"/>
      <path d="M${cx - 26} ${cy - 26} L${cx + 26} ${cy + 26} M${cx + 26} ${cy - 26} L${cx - 26} ${cy + 26}" stroke="${C.line}"/>`;
  }

  let label = '';
  if (room.type !== 'corridor') {
    const meta = room.type === 'core'
      ? 'Sirkulasi vertikal'
      : `${fmt1(room.temperature)}°C${room.capacity ? ` · ${room.occupancy} orang` : ''}`;
    label = `<text x="${x + 12}" y="${y + 22}" font-size="13" font-weight="500" fill="${C.ink}">${esc(room.name)}</text>
      <text x="${x + 12}" y="${y + 39}" font-size="12" fill="${C.muted}">${esc(meta)}</text>`;
  }

  return `<g class="fp-room${interactive ? ' fp-room--interactive' : ''}" data-room-id="${room.id}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${selected ? C.alt : fill}" stroke="${stroke}" stroke-width="${sw}"/>
    ${extra}${label}
  </g>`;
}

function deviceMarker(d, dimmed) {
  const state = deviceState(d);
  const glow = d.type === 'light' && state === 'on' ? `<circle cx="${d.x}" cy="${d.y}" r="16" fill="${C.ink}" opacity="0.05"/>` : '';
  return `<g class="fp-device" data-device-id="${d.id}" opacity="${dimmed ? 0.12 : 1}">
    ${glow}${markerShape(d.type, d.x, d.y, markerStyle(state))}
    <circle cx="${d.x}" cy="${d.y}" r="13" fill="transparent"/>
  </g>`;
}

export function floorPlanSvg({ floor, devices, selectedRoomId = null, filter = 'all' }) {
  const rooms = [...floor.rooms].sort((a, b) => (a.type === 'corridor' ? -1 : b.type === 'corridor' ? 1 : 0));
  const list = devices.filter((d) => d.floorId === floor.id);
  return `<svg viewBox="0 0 1000 560" class="block h-auto w-full min-w-[720px] select-none" role="img" aria-label="Denah ${esc(floor.name)}" font-family="Geist, Inter, system-ui, sans-serif">
    <defs>
      <pattern id="fp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="${C.alt}"/><line x1="0" y1="0" x2="0" y2="8" stroke="${C.hairline}" stroke-width="2"/>
      </pattern>
      <style>
        .fp-room--interactive { cursor: pointer; }
        .fp-room--interactive:hover > rect:first-child { stroke: ${C.ink}; }
        .fp-device { cursor: pointer; }
      </style>
    </defs>
    <rect x="14" y="14" width="972" height="532" rx="14" fill="${C.paper}" stroke="${C.ink}" stroke-width="2"/>
    ${rooms.map((r) => roomTile(r, r.id === selectedRoomId)).join('')}
    ${list.map((d) => deviceMarker(d, filter !== 'all' && d.type !== filter)).join('')}
  </svg>`;
}

export function floorPlanLegend() {
  const states = [
    ['Menyala / aktif', markerStyle('on')],
    ['Mati', markerStyle('off')],
    ['Offline', markerStyle('offline')],
  ];
  const shapes = Object.entries(DEVICE_TYPES)
    .map(([t, m]) => `<span class="inline-flex items-center gap-1.5"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${markerShape(t, 9, 9, `fill="${C.paper}" stroke="${C.ink}" stroke-width="1.5"`)}</svg>${m.label}</span>`)
    .join('');
  const stateHtml = states
    .map(([label, style]) => `<span class="inline-flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" ${style}/></svg>${label}</span>`)
    .join('');
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption tracking-normal text-mid-gray">${shapes}<span class="h-4 w-px bg-hairline max-sm:hidden"></span>${stateHtml}</div>`;
}

/**
 * Pasang denah interaktif ke container.
 * @returns {{ update: (opts) => void }}
 */
export function createFloorPlan(container, { onRoomSelect } = {}) {
  container.classList.add('relative');
  container.innerHTML = '<div class="scroll-thin overflow-x-auto" data-fp-scroll></div>';
  const scroll = container.querySelector('[data-fp-scroll]');
  const tooltip = createTooltip(container);
  let current = null;

  scroll.addEventListener('click', (e) => {
    const dev = e.target.closest('[data-device-id]');
    const room = e.target.closest('.fp-room--interactive');
    const roomId = dev ? current.devices.find((d) => d.id === dev.dataset.deviceId)?.roomId : room?.dataset.roomId;
    if (roomId && onRoomSelect) onRoomSelect(roomId);
  });

  scroll.addEventListener('pointermove', (e) => {
    const dev = e.target.closest('[data-device-id]');
    if (!dev || !current) return tooltip.hide();
    const d = current.devices.find((x) => x.id === dev.dataset.deviceId);
    const room = current.floor.rooms.find((r) => r.id === d.roomId);
    const meta = DEVICE_TYPES[d.type];
    const state = !d.online ? 'Offline' : d.on ? meta.onLabel : meta.offLabel;
    const power = d.on && d.online ? ` · ${meta.watt} W` : '';
    tooltip.show(`<div class="font-medium">${esc(d.name)} · ${esc(room.name)}</div><div class="opacity-70">${esc(state)}${power}</div>`, e);
  });
  scroll.addEventListener('pointerleave', () => tooltip.hide());

  return {
    update(opts) {
      current = opts;
      scroll.innerHTML = floorPlanSvg(opts);
    },
  };
}
