// Palet warna dashboard, diambil dari logo Kementerian Pekerjaan Umum:
// navy #203368 (warna utama) dan kuning #FDB714 (aksen: perangkat menyala, sorotan).
// Nilainya sama dengan token @theme di src/styles/main.css. Dipakai SVG dan Three.js
// yang tidak bisa membaca kelas Tailwind.
export const COLORS = {
  canvas: '#f3f5f9',
  paper: '#ffffff',
  alt: '#f8f9fc',
  hairline: '#e1e5ee',
  line: '#cbd2e0',
  off: '#9aa3b8',
  muted: '#5e6a85',
  ink: '#203368',
  inkSoft: '#172650',
  ink2: '#2c3f73',
  cabin: '#46577f',
  accent: '#fdb714',
  accentSoft: '#fff3d1',
  ember: '#e7000b',
};

/** '#203368' -> 0x203368, untuk material Three.js. */
export const hex = (color) => parseInt(color.slice(1), 16);
