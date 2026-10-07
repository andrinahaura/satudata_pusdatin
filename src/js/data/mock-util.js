// Helper bersama untuk generator data simulasi.
// Data hari-hari lalu dibuat ulang secara deterministik dari tanggalnya (seed = hash tanggal),
// jadi tidak perlu disimpan dan selalu sama setiap kali diminta. Data hari ini disimpan di state
// mock backend karena berubah realtime.

export function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Hash string menjadi seed positif (FNV-1a + pengaduk murmur3). Pengaduk perlu supaya tanggal
 * yang berdekatan ('2026-10-06' vs '2026-10-07') menghasilkan deret acak yang tidak mirip.
 */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return ((h >>> 0) % 2147483646) + 1;
}

export const rngFor = (text) => createRng(hashSeed(text));

export const isWeekendKey = (key) => {
  const day = new Date(`${key}T00:00:00`).getDay();
  return day === 0 || day === 6;
};

/** Waktu pada tanggal `key`, jam desimal (mis. 7.5 = 07.30). */
export const atHour = (key, hour) => new Date(new Date(`${key}T00:00:00`).getTime() + hour * 3600000);
