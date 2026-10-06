// Line chart multi-seri (SVG): periode berjalan, periode lalu, dan target.
// Nilai null = belum ada data (mis. jam yang belum lewat) dan memutus garis.
import { createTooltip, esc } from '../utils/dom.js';

const GRID = '#e5e5e5';
const MUTED = '#737373';

// Seri dibedakan lewat tebal & pola garis, bukan warna (design.md: monokrom).
export const LINE_STYLES = {
  current: { stroke: '#0a0a0a', width: 2, dash: '' },
  previous: { stroke: '#a3a3a3', width: 1.5, dash: '' },
  target: { stroke: '#737373', width: 1.25, dash: '4 4' },
};

function pathFor(values, xAt, yAt) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

/** Legenda HTML untuk seri yang dipakai. */
export function lineLegendHtml(series) {
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption tracking-normal text-mid-gray">${series
    .map((s) => {
      const st = LINE_STYLES[s.style];
      return `<span class="inline-flex items-center gap-1.5"><svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke="${st.stroke}" stroke-width="${st.width}" stroke-dasharray="${st.dash}"/></svg>${esc(s.label)}</span>`;
    })
    .join('')}</div>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ labels: string[], series: {label:string, values:(number|null)[], style:'current'|'previous'|'target'}[],
 *           height?: number, format?: (v:number)=>string, tickFormat?: (v:number)=>string }} opts
 */
export function createLineChart(container, opts) {
  container.classList.add('relative');
  const host = document.createElement('div');
  container.appendChild(host);
  const tooltip = createTooltip(container);
  let options = opts;
  let geometry = null;

  function render() {
    const { labels, series, height = 220, format = String, tickFormat = format } = options;
    const width = Math.max(260, host.clientWidth || container.clientWidth);
    const m = { top: 12, right: 8, bottom: 26, left: 40 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const all = series.flatMap((s) => s.values).filter((v) => v != null);
    const max = Math.max(0.1, ...all) * 1.1;
    const step = labels.length > 1 ? iw / (labels.length - 1) : iw;
    const xAt = (i) => m.left + i * step;
    const yAt = (v) => m.top + ih - (v / max) * ih;
    geometry = { m, step, labels, ih };

    const grid = [0, 0.5, 1]
      .map((t) => {
        const y = m.top + ih - t * ih;
        return `<line x1="${m.left}" x2="${width - m.right}" y1="${y}" y2="${y}" stroke="${GRID}" ${t === 0 ? '' : 'stroke-dasharray="2 4"'}/>
          <text x="${m.left - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="${MUTED}">${esc(tickFormat(t * max))}</text>`;
      })
      .join('');
    const every = Math.ceil(labels.length / Math.max(2, Math.floor(iw / 48)));
    const xLabels = labels
      .map((l, i) => (i % every === 0 ? `<text x="${xAt(i)}" y="${height - 6}" text-anchor="middle" font-size="12" fill="${MUTED}">${esc(l)}</text>` : ''))
      .join('');
    // Seri utama digambar terakhir supaya berada di atas.
    const ordered = [...series].sort((a, b) => (a.style === 'current') - (b.style === 'current'));
    const lines = ordered
      .map((s) => {
        const st = LINE_STYLES[s.style];
        return `<path d="${pathFor(s.values, xAt, yAt)}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}" stroke-dasharray="${st.dash}" stroke-linejoin="round" stroke-linecap="round"/>`;
      })
      .join('');
    const main = series.find((s) => s.style === 'current');
    const lastIndex = main ? main.values.findLastIndex((v) => v != null) : -1;
    const marker = lastIndex >= 0 ? `<circle cx="${xAt(lastIndex)}" cy="${yAt(main.values[lastIndex])}" r="3.5" fill="#0a0a0a" stroke="#fff" stroke-width="2"/>` : '';

    host.innerHTML = `<svg width="${width}" height="${height}" class="block" font-family="Inter, system-ui, sans-serif" role="img">
      ${grid}${xLabels}${lines}${marker}
      <line data-guide x1="0" x2="0" y1="${m.top}" y2="${m.top + ih}" stroke="${MUTED}" stroke-width="1" visibility="hidden"/>
    </svg>`;
  }

  host.addEventListener('pointermove', (e) => {
    if (!geometry) return;
    const box = host.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - geometry.m.left) / geometry.step);
    const guide = host.querySelector('[data-guide]');
    if (i < 0 || i >= geometry.labels.length) {
      guide.setAttribute('visibility', 'hidden');
      return tooltip.hide();
    }
    const x = geometry.m.left + i * geometry.step;
    guide.setAttribute('x1', x);
    guide.setAttribute('x2', x);
    guide.setAttribute('visibility', 'visible');
    const fmt = options.format ?? String;
    const rows = options.series
      .map((s) => `<div class="flex justify-between gap-4"><span class="opacity-70">${esc(s.label)}</span><span class="font-medium tabular-nums">${s.values[i] == null ? '–' : esc(fmt(s.values[i]))}</span></div>`)
      .join('');
    tooltip.show(`<div class="mb-0.5 opacity-70">${esc(geometry.labels[i])}</div>${rows}`, e);
  });
  host.addEventListener('pointerleave', () => {
    host.querySelector('[data-guide]')?.setAttribute('visibility', 'hidden');
    tooltip.hide();
  });

  new ResizeObserver(() => render()).observe(container);
  render();

  return {
    update(next) {
      options = { ...options, ...next };
      render();
    },
  };
}

/** Versi statis tanpa interaksi, lebar mengikuti container. Untuk panel kecil. */
export function miniLineChartSvg({ series, height = 96 }) {
  const width = 300;
  const pad = 4;
  const n = Math.max(...series.map((s) => s.values.length));
  const max = Math.max(0.01, ...series.flatMap((s) => s.values).filter((v) => v != null)) * 1.1;
  const xAt = (i) => pad + (i * (width - pad * 2)) / Math.max(1, n - 1);
  const yAt = (v) => height - pad - (v / max) * (height - pad * 2);
  const ordered = [...series].sort((a, b) => (a.style === 'current') - (b.style === 'current'));
  const lines = ordered
    .map((s) => {
      const st = LINE_STYLES[s.style];
      return `<path d="${pathFor(s.values, xAt, yAt)}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}" stroke-dasharray="${st.dash}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="block h-24 w-full" aria-hidden="true">
    <line x1="0" x2="${width}" y1="${height - pad}" y2="${height - pad}" stroke="${GRID}" vector-effect="non-scaling-stroke"/>${lines}
  </svg>`;
}
