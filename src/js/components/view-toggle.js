// Pilihan tampilan 3D / 2D untuk denah & peta parkir. Disimpan per browser.

const KEY = 'sdp:view-mode';

export function getViewMode() {
  try {
    return localStorage.getItem(KEY) === '2d' ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

export function setViewMode(mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* abaikan */
  }
}

export function viewToggleHtml(mode) {
  const btn = (value, label) => `<button type="button" role="tab" data-view-mode="${value}" aria-selected="${mode === value}">${label}</button>`;
  return `<div class="segmented" role="tablist" aria-label="Mode tampilan">${btn('3d', '3D')}${btn('2d', '2D')}</div>`;
}
