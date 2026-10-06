// Gaya seri grafik garis, legenda, dan grafik mini statis untuk panel kecil.
// Grafik interaktif ada di trend-chart.js. Nilai null = belum ada data dan memutus garis.
import { COLORS } from '../theme.js';
import { esc } from '../utils/dom.js';

const GRID = COLORS.hairline;

// Seri dibedakan lewat warna dan pola garis: periode berjalan navy, periode lalu abu,
// target kuning putus-putus.
export const LINE_STYLES = {
  current: { stroke: COLORS.ink, width: 2, dash: '' },
  previous: { stroke: COLORS.off, width: 1.5, dash: '' },
  target: { stroke: COLORS.accent, width: 1.75, dash: '5 4' },
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
