// Rentang waktu dashboard: Hari ini, Kemarin, 7 hari, 30 hari, atau Custom (tanggal dari–sampai).
// Semua tanggal memakai zona waktu lokal browser. Kunci tanggal berbentuk 'YYYY-MM-DD'.
// resolveRange() mengubah pilihan pengguna (spec) menjadi objek rentang yang dipakai halaman,
// selector, dan api: { from, to, keys, single, label, short, previous: { from, to, keys }, ... }.

export const RANGE_PRESETS = [
  { value: 'today', label: 'Hari ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
  { value: 'custom', label: 'Custom' },
];

export const DEFAULT_RANGE = { preset: 'today' };
export const MAX_RANGE_DAYS = 90;

const DAY = 86400000;
const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const pad2 = (n) => String(n).padStart(2, '0');

export const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseKey = (key) => new Date(`${key}T00:00:00`);
export const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseKey(v).getTime());

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Daftar kunci tanggal dari a sampai b (inklusif). */
export function keysBetween(a, b) {
  const keys = [];
  for (let d = startOfDay(a); d <= b; d = addDays(d, 1)) keys.push(dateKey(d));
  return keys;
}

const dayFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const dayFmtNoYear = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

function spanLabel(from, lastDay) {
  if (dateKey(from) === dateKey(lastDay)) return dayFmt.format(from);
  const sameYear = from.getFullYear() === lastDay.getFullYear();
  return `${(sameYear ? dayFmtNoYear : dayFmt).format(from)} – ${dayFmt.format(lastDay)}`;
}

// Versi pendek untuk label KPI: "10–20 Sep", "28 Agu – 3 Sep", "10 Sep".
function shortSpan(from, lastDay) {
  if (dateKey(from) === dateKey(lastDay)) return dayFmtNoYear.format(from);
  if (from.getFullYear() !== lastDay.getFullYear()) return spanLabel(from, lastDay);
  if (from.getMonth() === lastDay.getMonth()) return `${from.getDate()}–${dayFmtNoYear.format(lastDay)}`;
  return `${dayFmtNoYear.format(from)} – ${dayFmtNoYear.format(lastDay)}`;
}

/**
 * spec: { preset, from?, to? } (from/to = kunci tanggal, hanya untuk custom).
 * Rentang custom dijepit: tidak melewati hari ini, maksimal MAX_RANGE_DAYS hari.
 */
export function resolveRange(spec = DEFAULT_RANGE, now = new Date()) {
  const today = startOfDay(now);
  let preset = RANGE_PRESETS.some((p) => p.value === spec?.preset) ? spec.preset : DEFAULT_RANGE.preset;
  let first;
  let last;
  if (preset === 'yesterday') {
    first = addDays(today, -1);
    last = first;
  } else if (preset === '7d' || preset === '30d') {
    first = addDays(today, preset === '7d' ? -6 : -29);
    last = today;
  } else if (preset === 'custom' && isDateKey(spec.from) && isDateKey(spec.to)) {
    first = parseKey(spec.from);
    last = parseKey(spec.to);
    if (first > last) [first, last] = [last, first];
    if (last > today) last = today;
    if (first > today) first = today;
    if ((last - first) / DAY + 1 > MAX_RANGE_DAYS) first = addDays(last, -(MAX_RANGE_DAYS - 1));
  } else {
    preset = 'today';
    first = today;
    last = today;
  }

  const keys = keysBetween(first, last);
  const includesToday = dateKey(last) === dateKey(today);
  const to = includesToday ? new Date(now) : new Date(addDays(last, 1).getTime() - 1);
  const prevLast = addDays(first, -1);
  const prevFirst = addDays(first, -keys.length);
  const single = keys.length === 1;

  const short = { today: 'hari ini', yesterday: 'kemarin', '7d': '7 hari', '30d': '30 hari' }[preset] ?? shortSpan(first, last);
  const currentLabel = { today: 'Hari ini', yesterday: 'Kemarin' }[preset] ?? 'Periode ini';
  const previousLabel = { today: 'Kemarin', yesterday: '2 hari lalu' }[preset] ?? 'Periode sebelumnya';

  return {
    preset,
    spec: preset === 'custom' ? { preset, from: keys[0], to: keys[keys.length - 1] } : { preset },
    from: first,
    to,
    keys,
    single,
    includesToday,
    label: spanLabel(first, last),
    short,
    currentLabel,
    previousLabel,
    previous: { from: prevFirst, to: new Date(addDays(prevLast, 1).getTime() - 1), keys: keysBetween(prevFirst, prevLast) },
  };
}

/** Label sumbu-x per hari: nama hari untuk ≤ 7 hari, tanggal untuk rentang lebih panjang. */
export function dayLabels(keys) {
  return keys.map((k) => (keys.length <= 7 ? WEEKDAY_SHORT[parseKey(k).getDay()] : String(parseKey(k).getDate())));
}

/** Label sumbu-x per jam: '00.00' … '23.00'. */
export const hourLabels = () => Array.from({ length: 24 }, (_, h) => `${pad2(h)}.00`);

/** Parameter query untuk API: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }. */
export const rangeQuery = (range, { withPrevious = false } = {}) => ({
  from: withPrevious ? range.previous.keys[0] : range.keys[0],
  to: range.keys[range.keys.length - 1],
});
