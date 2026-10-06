const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape teks sebelum disisipkan ke innerHTML. */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

export function setParams(params) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history.replaceState(null, '', url);
}

/** Tooltip yang mengikuti pointer di dalam container ber-position relative. */
export function createTooltip(container) {
  const el = document.createElement('div');
  el.className = 'tooltip hidden';
  el.setAttribute('role', 'tooltip');
  container.appendChild(el);
  return {
    show(html, event) {
      el.innerHTML = html;
      el.classList.remove('hidden');
      const box = container.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const w = el.offsetWidth;
      const left = Math.min(Math.max(8, x - w / 2), box.width - w - 8);
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(8, y - el.offsetHeight - 14)}px`;
    },
    hide() {
      el.classList.add('hidden');
    },
  };
}
