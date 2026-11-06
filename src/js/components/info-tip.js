// Rumus yang muncul saat elemen [data-info] disorot atau difokus.
// Elemen dipasang di <body> supaya tidak ikut diskalakan mode layar penuh Home.
import { esc } from '../utils/dom.js';

const DELAY_MS = 200;
const GAP = 8;

/** @param {(key: string) => string[] | undefined} lookup baris rumus untuk kunci data-info */
export function mountInfoTip(lookup) {
  const el = document.createElement('div');
  el.className = 'info-tip hidden';
  el.setAttribute('role', 'tooltip');
  document.body.append(el);
  let timer = null;

  function hide() {
    clearTimeout(timer);
    el.classList.add('hidden');
  }

  function show(target) {
    const lines = lookup(target.dataset.info);
    if (!lines) return;
    el.innerHTML = lines.map((line) => `<p>${esc(line)}</p>`).join('');
    el.classList.remove('hidden');
    const box = target.getBoundingClientRect();
    const left = Math.min(Math.max(GAP, box.left + box.width / 2 - el.offsetWidth / 2), innerWidth - el.offsetWidth - GAP);
    const above = box.top - el.offsetHeight - GAP;
    el.style.left = `${left}px`;
    el.style.top = `${above >= GAP ? above : box.bottom + GAP}px`;
  }

  const enter = (e) => {
    const target = e.target.closest?.('[data-info]');
    if (!target) return hide();
    clearTimeout(timer);
    timer = setTimeout(() => show(target), DELAY_MS);
  };

  document.addEventListener('pointerover', enter);
  document.addEventListener('focusin', enter);
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
}
