// Hanya ikon yang dipakai yang di-import, supaya bundle kecil.
// Ikon dipakai untuk fungsi (tombol ikon, kolom cari, pesan error), bukan hiasan.
// Tambah ikon baru: import dari 'lucide' lalu masukkan ke objek ICONS.
import { ArrowUp, Check, ChevronDown, createIcons, Menu, Mic, Minus, Plus, RotateCcw, Search, Square, TriangleAlert, X } from 'lucide';

const ICONS = { ArrowUp, Check, ChevronDown, Menu, Mic, Minus, Plus, RotateCcw, Search, Square, TriangleAlert, X };

/** Ganti semua <i data-lucide="nama"> di dalam root menjadi SVG. */
export function renderIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { 'stroke-width': 1.75, 'aria-hidden': 'true' } });
}

/** Markup placeholder ikon untuk template string. */
export const icon = (name, cls = 'size-4') => `<i data-lucide="${name}" class="${cls}"></i>`;
