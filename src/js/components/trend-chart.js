// Grafik tren (SVG) dipakai semua grafik dashboard: kurva halus, garis panduan putus-putus
// per titik, label sumbu-x di dalam chip bulat, dan satu titik terpilih yang disorot
// (pita, garis vertikal, tooltip pill). Hover / panah kiri-kanan memindah pilihan.
// Nilai null = belum ada data (mis. jam yang belum lewat) dan memutus kurva.
import { COLORS } from '../theme.js';
import { esc } from '../utils/dom.js';
import { LINE_STYLES } from './line-chart.js';

const CHIP_R = 14;
const PILL_H = 30;

let uid = 0;

// Kurva monoton (Fritsch–Carlson): halus tanpa melewati nilai puncak/lembah data.
function smoothPath(points) {
  if (points.length < 2) return points.length ? `M${points[0].x} ${points[0].y}` : '';
  const n = points.length;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    m[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      t[i] = (3 / h) * a * m[i];
      t[i + 1] = (3 / h) * b * m[i];
    }
  }
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const c = dx[i] / 3;
    d += ` C${(p.x + c).toFixed(1)} ${(p.y + t[i] * c).toFixed(1)} ${(q.x - c).toFixed(1)} ${(q.y - t[i + 1] * c).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }
  return d;
}

// Satu path per segmen tanpa null.
function seriesPath(values, xAt, yAt) {
  const segments = [];
  let current = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push({ x: xAt(i), y: yAt(v) });
  });
  if (current.length) segments.push(current);
  return segments.map(smoothPath).join(' ');
}

// "10.00" -> "10" supaya muat di chip; label lain dipakai apa adanya.
const chipText = (label) => (/^\d{2}\.00$/.test(label) ? label.slice(0, 2) : label);

/**
 * @param {HTMLElement} container
 * @param {{ labels: string[],
 *           series: {label:string, values:(number|null)[], style:'current'|'previous'|'target'}[],
 *           height?: number, format?: (v:number)=>string, selected?: number }} opts
 *   `selected` = indeks yang disorot saat tidak ada hover (default: titik terakhir seri utama).
 */
export function createTrendChart(container, opts) {
  const id = `trend-${++uid}`;
  const host = document.createElement('div');
  host.className = 'select-none outline-none';
  host.tabIndex = 0;
  container.appendChild(host);
  let options = opts;
  let hover = null;

  const mainSeries = () => options.series.find((s) => s.style === 'current') ?? options.series[0];
  const defaultIndex = () => options.selected ?? Math.max(0, mainSeries().values.findLastIndex((v) => v != null));
  const activeIndex = () => hover ?? defaultIndex();

  function pillText(i) {
    const fmt = options.format ?? String;
    const main = mainSeries();
    const value = main.values[i];
    const other = options.series.find((s) => s.style === 'previous');
    if (value == null) return other?.values[i] != null ? `${other.label} ${fmt(other.values[i])}` : options.labels[i];
    const extra = other?.values[i] != null ? ` · ${other.label.toLowerCase()} ${fmt(other.values[i])}` : '';
    return `${fmt(value)}${extra}`;
  }

  function render() {
    const { labels, series, height = 260 } = options;
    const width = Math.max(280, host.clientWidth || container.clientWidth);
    const n = labels.length;
    // Ruang tepi cukup untuk pita sorot di titik pertama/terakhir.
    const padX = 26;
    const top = PILL_H + 22;
    const chipY = height - CHIP_R - 2;
    const plotBottom = chipY - CHIP_R - 14;
    const step = n > 1 ? (width - padX * 2) / (n - 1) : 0;
    const xAt = (i) => padX + i * step;
    const values = series.flatMap((s) => s.values).filter((v) => v != null);
    const max = Math.max(0.1, ...values);
    const min = Math.min(...values, max);
    // Skala dari sedikit di bawah minimum supaya bentuk kurva terlihat jelas.
    const lo = Math.max(0, min - (max - min) * 0.25);
    const yAt = (v) => plotBottom - ((v - lo) / (max - lo || 1)) * (plotBottom - top - 10);

    // Chip tidak boleh bertumpuk: tampilkan tiap k label, ditambah yang terpilih.
    const every = Math.max(1, Math.ceil((CHIP_R * 2 + 6) / Math.max(step, 1)));
    const sel = activeIndex();
    const shown = (i) => i % every === 0 || i === sel;

    const guides = labels
      .map((_, i) => (shown(i) && i !== sel ? `<line x1="${xAt(i)}" x2="${xAt(i)}" y1="${top}" y2="${chipY - CHIP_R - 4}" stroke="${COLORS.hairline}" stroke-dasharray="3 4"/><circle cx="${xAt(i)}" cy="${top}" r="2.5" fill="${COLORS.line}"/>` : ''))
      .join('');

    const bandW = Math.min(44, Math.max(14, step * 0.6));
    const sx = xAt(sel);
    const band = `<rect x="${sx - bandW / 2}" y="${top}" width="${bandW}" height="${chipY - top}" fill="url(#${id}-band)"/>
      <line x1="${sx}" x2="${sx}" y1="${top}" y2="${chipY - CHIP_R - 1}" stroke="${COLORS.ink}" stroke-width="1.5"/>
      <circle cx="${sx}" cy="${top}" r="3.5" fill="${COLORS.ink}"/>`;

    const ordered = [...series].sort((a, b) => (a.style === 'current') - (b.style === 'current'));
    const lines = ordered
      .map((s) => {
        const st = LINE_STYLES[s.style];
        const w = s.style === 'current' ? 3 : st.width;
        // Titik yang berdiri sendiri (tetangganya null) tidak membentuk garis: beri penanda.
        const lone = s.values
          .map((v, i) => (v != null && s.values[i - 1] == null && s.values[i + 1] == null ? `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="${w + 1}" fill="${st.stroke}"/>` : ''))
          .join('');
        return `<path d="${seriesPath(s.values, xAt, yAt)}" fill="none" stroke="${st.stroke}" stroke-width="${w}" stroke-dasharray="${st.dash}" stroke-linecap="round" stroke-linejoin="round"/>${lone}`;
      })
      .join('');

    const chips = labels
      .map((l, i) => {
        if (!shown(i)) return '';
        const active = i === sel;
        return `<g>
          <circle cx="${xAt(i)}" cy="${chipY}" r="${CHIP_R}" fill="${COLORS.paper}" stroke="${active ? COLORS.ink : COLORS.hairline}" stroke-width="${active ? 2.5 : 1}"/>
          <text x="${xAt(i)}" y="${chipY + 4}" text-anchor="middle" font-size="11" font-weight="${active ? 600 : 500}" fill="${active ? COLORS.ink : COLORS.muted}">${esc(chipText(l))}</text>
        </g>`;
      })
      .join('');

    // Tooltip pill di atas titik terpilih, dijepit agar tidak keluar dari kartu.
    const text = pillText(sel);
    const pillW = Math.max(64, text.length * 6.6 + 28);
    const pillX = Math.min(Math.max(sx - pillW / 2, 0), width - pillW);
    const pill = `<g filter="url(#${id}-shadow)">
        <rect x="${pillX}" y="2" width="${pillW}" height="${PILL_H}" rx="${PILL_H / 2}" fill="${COLORS.ink}"/>
      </g>
      <text x="${pillX + pillW / 2}" y="${2 + PILL_H / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.paper}">${esc(text)}</text>`;

    host.innerHTML = `<svg width="${width}" height="${height}" class="block" font-family="Inter, system-ui, sans-serif" role="img" aria-label="${esc(`${labels[sel]}: ${text}`)}">
      <defs>
        <linearGradient id="${id}-band" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0.02"/>
          <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.2"/>
        </linearGradient>
        <filter id="${id}-shadow" x="-20%" y="-40%" width="140%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="${COLORS.ink}" flood-opacity="0.25"/>
        </filter>
      </defs>
      ${guides}${band}${lines}${chips}${pill}
    </svg>`;
    host.dataset.step = step;
    host.dataset.padX = padX;
  }

  host.addEventListener('pointermove', (e) => {
    const n = options.labels.length;
    const step = Number(host.dataset.step) || 1;
    const x = e.clientX - host.getBoundingClientRect().left - Number(host.dataset.padX);
    const i = Math.min(n - 1, Math.max(0, Math.round(x / step)));
    if (i !== hover) {
      hover = i;
      render();
    }
  });
  host.addEventListener('pointerleave', () => {
    hover = null;
    render();
  });
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const n = options.labels.length;
    hover = Math.min(n - 1, Math.max(0, activeIndex() + (e.key === 'ArrowRight' ? 1 : -1)));
    render();
  });
  host.addEventListener('blur', () => {
    hover = null;
    render();
  });

  new ResizeObserver(() => render()).observe(container);
  render();

  return {
    update(next) {
      options = { ...options, ...next };
      if (hover != null && hover >= options.labels.length) hover = null;
      render();
    },
  };
}
