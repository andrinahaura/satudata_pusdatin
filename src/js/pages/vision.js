// AI Vision: kendaraan di satu lokasi parkir (piloting Smart Parking, parkir susun, 24 slot).
// Data yang dipakai hanya hasil pembacaan nomor polisi (ALPR) di gerbang: jam masuk, jam keluar,
// slot tersedia, dan okupansi. Tidak ada kamera area; ilustrasi parkir digambar dari status slot.
import { createDateRange } from '../components/date-range.js';
import { mountLayout } from '../components/layout.js';
import { lineLegendHtml } from '../components/line-chart.js';
import { createParkingMap, parkingLegendHtml } from '../components/parking-map.js';
import { siteLabel, siteSlotsHtml } from '../components/parking-site.js';
import { createParking3D } from '../components/three/parking-3d.js';
import { getViewMode, setViewMode, viewToggleHtml } from '../components/view-toggle.js';
import { createTrendChart } from '../components/trend-chart.js';
import { renderIcons } from '../components/icons.js';
import { errorState, segmentedHtml, statTile } from '../components/ui.js';
import { api } from '../services/api.js';
import { parkingRange, summarizeParking, visitMinutes } from '../services/selectors.js';
import { $, esc } from '../utils/dom.js';
import { fmtDateTime, fmtDuration, fmtInt, fmtTime } from '../utils/format.js';
import { rangeQuery } from '../utils/range.js';

mountLayout({ page: 'vision' });

const state = { parking: null, stats: null, visits: null, visitFilter: 'all', visitSearch: '', view: getViewMode() };

const maps = {
  '3d': createParking3D($('[data-map-3d]')),
  '2d': createParkingMap($('[data-map-2d]')),
};
$('[data-parking-legend]').innerHTML = parkingLegendHtml();
$('[data-view-toggle]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view-mode]');
  if (!btn) return;
  state.view = btn.dataset.viewMode;
  setViewMode(state.view);
  renderMap();
});

// Rentang waktu berlaku untuk KPI, grafik okupansi, dan riwayat kendaraan.
// Slot tersedia, kendaraan yang sedang parkir, dan deteksi gerbang terbaru selalu kondisi saat ini.
const picker = createDateRange($('[data-range]'), {
  onChange: async () => {
    await loadRanged();
    render();
  },
});

let chart = null;

function renderKpis() {
  const range = picker.range;
  const r = state.stats ? parkingRange(state.stats, range) : null;
  $('[data-kpis]').innerHTML = [
    statTile({ label: `Masuk ${range.short}`, value: r ? fmtInt(r.in) : '–', sub: 'Nomor polisi terbaca di gerbang' }),
    statTile({ label: `Keluar ${range.short}`, value: r ? fmtInt(r.out) : '–', sub: 'Nomor polisi terbaca di gerbang' }),
    statTile({ label: 'Rata-rata lama parkir', value: r ? fmtDuration(r.avgDurationMin) : '–', sub: `Kendaraan keluar ${range.short}` }),
    statTile({ label: 'Okupansi puncak', value: r ? `${Math.round(r.peak * 100)}%` : '–', sub: range.label }),
  ].join('');
  $('[data-updated]').textContent = `Diperbarui ${fmtTime(state.parking.updatedAt)}`;
}

// Satu lokasi: zona pertama = rak parkir susun (rows = tingkat, cols = slot per tingkat).
function renderMap() {
  const zone = state.parking.zones[0];
  $('[data-map-desc]').textContent = `${siteLabel(state.parking.site)} · ${zone.rows} tingkat × ${zone.cols} slot`;
  $('[data-view-toggle]').innerHTML = viewToggleHtml(state.view);
  $('[data-map-3d]').classList.toggle('hidden', state.view !== '3d');
  $('[data-map-2d]').classList.toggle('hidden', state.view !== '2d');
  maps[state.view].update(zone);
}

function renderSite(p) {
  $('[data-site-name]').textContent = siteLabel(state.parking.site);
  $('[data-site-slots]').innerHTML = siteSlotsHtml(p, { layout: 'stack' });
}

// Mobil yang sedang parkir, terlama di atas.
function renderInside() {
  const inside = state.parking.visits.filter((v) => !v.outAt).sort((a, b) => a.inAt.localeCompare(b.inAt));
  const today = new Date().toDateString();
  $('[data-inside-title]').innerHTML = `Sedang parkir <span class="font-normal text-mid-gray">${inside.length}</span>`;
  $('[data-inside]').innerHTML =
    inside
      .map((v) => `<tr>
          <td class="font-mono font-medium whitespace-nowrap">${esc(v.plate)}</td>
          <td class="whitespace-nowrap text-mid-gray">${new Date(v.inAt).toDateString() === today ? fmtTime(v.inAt) : fmtDateTime(v.inAt)}</td>
          <td class="num">${fmtDuration(visitMinutes(v))}</td>
        </tr>`)
      .join('') || '<tr><td colspan="3" class="py-6 text-center text-mid-gray">Tidak ada kendaraan yang sedang parkir.</td></tr>';
}

function renderChart() {
  if (!state.stats) return;
  const range = picker.range;
  const r = parkingRange(state.stats, range);
  const lines = r.series.second
    ? [{ label: 'Puncak', values: r.series.main, style: 'current' }, { label: 'Rata-rata', values: r.series.second, style: 'previous' }]
    : [{ label: 'Okupansi', values: r.series.main, style: 'current' }];
  const now = r.series.labels.indexOf(String(new Date().getHours()).padStart(2, '0'));
  const opts = { labels: r.series.labels, series: lines, height: 260, format: (v) => `${v}% terisi`, selected: range.preset === 'today' && now >= 0 ? now : undefined };
  $('[data-chart-legend]').classList.toggle('hidden', lines.length < 2);
  $('[data-chart-legend]').innerHTML = lines.length > 1 ? lineLegendHtml(lines) : '';
  $('[data-chart-desc]').textContent = `${range.single ? 'Per jam' : 'Puncak dan rata-rata per hari'}, ${range.label}`;
  $('[data-chart-summary]').innerHTML = `<span class="text-ink/80">Puncak</span><span class="font-semibold tabular-nums">${Math.round(r.peak * 100)}%</span>`;
  if (chart) chart.update(opts);
  else chart = createTrendChart($('[data-chart]'), opts);
}

/* --------------------------- riwayat kendaraan --------------------------- */

function renderVisits() {
  if (!state.visits) return;
  const { items, counts } = state.visits;
  const filters = [
    { value: 'all', label: `Semua (${fmtInt(counts.all)})` },
    { value: 'inside', label: `Di dalam (${fmtInt(counts.inside)})` },
    { value: 'out', label: `Sudah keluar (${fmtInt(counts.out)})` },
  ];
  $('[data-visits-filter]').innerHTML = segmentedHtml(filters, state.visitFilter, 'data-visits-filter-id');
  const shown = counts[state.visitFilter];
  $('[data-visits-title]').innerHTML = `Riwayat kendaraan <span class="font-normal text-mid-gray">${shown > items.length ? `${items.length} terbaru dari ${fmtInt(shown)}` : fmtInt(shown)}</span>`;
  // Rentang lebih dari satu hari: tampilkan tanggal di jam masuk/keluar.
  const when = picker.range.single ? fmtTime : fmtDateTime;
  $('[data-visits]').innerHTML =
    items
      .map((x) => `<tr>
          <td class="font-mono font-medium whitespace-nowrap">${esc(x.plate)}</td>
          <td class="whitespace-nowrap">${when(x.inAt)}</td>
          <td class="whitespace-nowrap">${x.outAt ? when(x.outAt) : '<span class="badge badge-solid">Masih parkir</span>'}</td>
          <td class="num">${fmtDuration(visitMinutes(x))}</td>
          <td class="num text-mid-gray">${Math.round(x.confidence * 100)}%</td>
        </tr>`)
      .join('') || '<tr><td colspan="5" class="py-6 text-center text-mid-gray">Tidak ada kendaraan yang cocok.</td></tr>';
}

async function loadVisits() {
  const range = picker.range;
  const res = await api.getParkingVisits({ ...rangeQuery(range), status: state.visitFilter, q: state.visitSearch });
  if (picker.range.label === range.label) state.visits = res;
}

$('[data-visits-filter]').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-visits-filter-id]');
  if (!btn) return;
  state.visitFilter = btn.dataset.visitsFilterId;
  await loadVisits();
  renderVisits();
});
let searchTimer = null;
$('[data-visits-search]').addEventListener('input', (e) => {
  state.visitSearch = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    await loadVisits();
    renderVisits();
  }, 250);
});

/* ------------------------- deteksi gerbang terbaru ------------------------- */

// Jumlah baris yang muat utuh di kartu (tinggi kartu mengikuti grafik di sebelahnya).
const EVENT_ROW_H = 44;
const HEAD_H = 34;
function eventRowsThatFit() {
  // Layar sempit: kartu ditumpuk dan tidak punya tinggi tetap, tampilkan 6 baris.
  if (!window.matchMedia('(min-width: 1024px)').matches) return 6;
  const h = $('[data-events-box]').clientHeight - 8; // pb-2
  return Math.max(3, Math.floor((h - HEAD_H) / EVENT_ROW_H));
}

function renderEvents() {
  $('[data-events]').innerHTML = state.parking.events
    .slice(0, eventRowsThatFit())
    .map((ev) => `<tr>
        <td class="text-mid-gray">${fmtTime(ev.time)}</td>
        <td class="font-mono text-[13px] font-medium whitespace-nowrap">${esc(ev.plate)}</td>
        <td><span class="badge ${ev.direction === 'in' ? 'badge-solid' : 'badge-soft'}">${ev.direction === 'in' ? 'Masuk' : 'Keluar'}</span></td>
        <td class="num">${Math.round(ev.confidence * 100)}%</td>
      </tr>`)
    .join('');
}

let lastBoxHeight = 0;
new ResizeObserver(() => {
  const h = $('[data-events-box]').clientHeight;
  if (state.parking && Math.abs(h - lastBoxHeight) > 2) {
    lastBoxHeight = h;
    renderEvents();
  }
}).observe($('[data-events-box]'));

/* --------------------------------- data --------------------------------- */

function render() {
  if (!state.parking) return;
  const p = summarizeParking(state.parking);
  renderKpis();
  renderMap();
  renderSite(p);
  renderInside();
  renderChart();
  renderEvents();
  renderVisits();
  renderIcons($('main'));
}

// Data berentang waktu dimuat ulang saat rentang berganti dan tiap pembaruan realtime.
async function loadRanged() {
  const range = picker.range;
  const [stats] = await Promise.all([api.getParkingStats(rangeQuery(range)), loadVisits()]);
  if (picker.range.label === range.label) state.stats = stats;
}

async function load() {
  try {
    [state.parking] = await Promise.all([api.getParking(), loadRanged()]);
    render();
  } catch (err) {
    $('[data-kpis]').innerHTML = `<div class="col-span-full bg-paper p-3">${errorState(`Gagal memuat data parkir: ${err.message}`)}</div>`;
  }
}

api.subscribe(async (next) => {
  if (!next.parking) return;
  state.parking = next.parking;
  await loadRanged();
  render();
});

load();
