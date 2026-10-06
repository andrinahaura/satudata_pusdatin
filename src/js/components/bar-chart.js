// Bar chart satu seri (SVG), responsif terhadap lebar container, dengan tooltip hover.
import { createTooltip, esc } from '../utils/dom.js';

const INK = '#171717';
const GRID = '#e5e5e5';
const MUTED = '#737373';

function topRoundedBar(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h} V${y + rr} Q${x} ${y} ${x + rr} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h} Z`;
}

/**
 * @param {HTMLElement} container
 * @param {{ data: {label:string, value:number}[], max?: number, height?: number,
 *           format?: (v:number)=>string, tickFormat?: (v:number)=>string, highlight?: string }} opts
 */
export function createBarChart(container, opts) {
  container.classList.add('relative');
  const host = document.createElement('div');
  container.appendChild(host);
  const tooltip = createTooltip(container);
  let options = opts;

  function render() {
    const { data, height = 220, format = String, tickFormat = format, highlight } = options;
    const width = Math.max(280, host.clientWidth || container.clientWidth);
    const m = { top: 12, right: 4, bottom: 26, left: 40 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const max = options.max ?? Math.max(1, ...data.map((d) => d.value));
    const step = iw / data.length;
    const gap = Math.max(2, step * 0.28);
    const bw = step - gap;
    const ticks = [0, 0.5, 1].map((t) => t * max);
    const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 44)));

    const grid = ticks
      .map((t) => {
        const y = m.top + ih - (t / max) * ih;
        return `<line x1="${m.left}" x2="${width - m.right}" y1="${y}" y2="${y}" stroke="${GRID}" ${t === 0 ? '' : 'stroke-dasharray="2 4"'}/>
          <text x="${m.left - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="${MUTED}">${esc(tickFormat(t))}</text>`;
      })
      .join('');
    const bars = data
      .map((d, i) => {
        const h = (d.value / max) * ih;
        const x = m.left + i * step + gap / 2;
        const y = m.top + ih - h;
        const dim = highlight && d.label !== highlight ? 0.35 : 1;
        const label = i % labelEvery === 0 ? `<text x="${x + bw / 2}" y="${height - 6}" text-anchor="middle" font-size="12" fill="${MUTED}">${esc(d.label)}</text>` : '';
        return `<g data-i="${i}">
          <path d="${topRoundedBar(x, y, bw, h)}" fill="${INK}" opacity="${dim}"/>
          <rect x="${m.left + i * step}" y="${m.top}" width="${step}" height="${ih}" fill="transparent"/>
          ${label}
        </g>`;
      })
      .join('');
    host.innerHTML = `<svg width="${width}" height="${height}" class="block" font-family="Inter, system-ui, sans-serif" role="img">${grid}${bars}</svg>`;
  }

  host.addEventListener('pointermove', (e) => {
    const g = e.target.closest('[data-i]');
    if (!g) return tooltip.hide();
    const d = options.data[Number(g.dataset.i)];
    const fmt = options.format ?? String;
    tooltip.show(`<div class="opacity-70">${esc(d.label)}</div><div class="font-medium">${esc(fmt(d.value))}</div>`, e);
  });
  host.addEventListener('pointerleave', () => tooltip.hide());

  new ResizeObserver(() => render()).observe(container);
  render();

  return {
    update(next) {
      options = { ...options, ...next };
      render();
    },
  };
}
