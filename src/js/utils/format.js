const nf1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('id-ID');

export const fmt1 = (n) => nf1.format(n);
export const fmtInt = (n) => nf0.format(n);
export const fmtPct = (ratio) => `${Math.round(ratio * 100)}%`;

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(date = new Date()) {
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtRelative(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  return `${h} jam ${min % 60} menit lalu`;
}


/** 1234567 -> "1,2 jt", 12300 -> "12,3 rb". Untuk angka besar di stat tile (token, biaya). */
export function fmtCompact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${nf1.format(n / 1e9)} M`;
  if (abs >= 1e6) return `${nf1.format(n / 1e6)} jt`;
  if (abs >= 1e4) return `${nf1.format(n / 1e3)} rb`;
  return nf0.format(Math.round(n));
}

/** Durasi menit -> "2 jam 15 menit" / "45 menit". */
export function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} menit`;
  return m % 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m / 60} jam`;
}

export const fmtRupiah = (v) => `Rp ${nf0.format(Math.round(v))}`;

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
