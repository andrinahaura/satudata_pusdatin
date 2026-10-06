import { icon, renderIcons } from './icons.js';

export const NAV = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'iot', label: 'IoT', href: '/iot.html' },
  { id: 'chatbot', label: 'Chatbot', href: '/chatbot.html' },
  { id: 'vision', label: 'Computer Vision', href: '/vision.html' },
];

function navbarHtml(active) {
  const link = (n) => `<a href="${n.href}" class="nav-link" ${n.id === active ? 'aria-current="page"' : ''}>${n.label}</a>`;
  return `
    <div class="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-4 sm:px-6 lg:px-8">
      <a href="/" class="flex shrink-0 items-center gap-3">
        <span class="leading-tight max-sm:hidden">
          <span class="block text-body font-semibold">SatuData</span>
          <span class="block text-caption tracking-normal text-mid-gray">Pusdatin Smart Building</span>
        </span>
      </a>

      <nav class="flex items-center gap-1 rounded-pill bg-canvas p-1 max-lg:hidden" aria-label="Menu utama">
        ${NAV.map(link).join('')}
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <button type="button" class="input flex w-44 cursor-pointer items-center gap-2 text-left text-mid-gray max-md:hidden xl:w-56" data-palette-open>
          ${icon('search', 'size-4')}<span class="flex-1">Tanya chatbot…</span>
          <kbd class="rounded-small border border-hairline bg-paper px-1.5 font-mono tabular-nums text-[11px]">⌘K</kbd>
        </button>
        <button type="button" class="btn btn-ghost btn-icon md:hidden" data-palette-open aria-label="Tanya chatbot">${icon('search')}</button>
        <span class="hidden text-body text-mid-gray tabular-nums sm:inline" data-clock></span>
        <button type="button" class="btn btn-ghost btn-icon -mr-2 lg:hidden" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="Buka menu">${icon('menu')}</button>
      </div>
    </div>

    <div id="mobile-menu" class="hidden border-t border-hairline lg:hidden">
      <nav class="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-3 sm:px-6" aria-label="Menu utama">
        ${NAV.map(link).join('')}
      </nav>
    </div>`;
}

function paletteHtml() {
  return `
    <div class="fixed inset-0 z-50 hidden items-start justify-center bg-ink/30 px-4 pt-[15vh]" data-palette role="dialog" aria-modal="true" aria-label="Tanya chatbot">
      <form class="card w-full max-w-lg p-2" data-palette-form>
        <div class="flex items-center gap-2 px-2">
          ${icon('search', 'size-4 text-mid-gray')}
          <input name="q" class="h-11 flex-1 bg-transparent text-body-lg outline-none placeholder:text-mid-gray" placeholder="Contoh: lampu yang belum mati?" autocomplete="off" />
          <kbd class="rounded-small border border-hairline px-1.5 font-mono tabular-nums text-[11px] text-mid-gray">Esc</kbd>
        </div>
        <div class="flex flex-wrap gap-2 border-t border-hairline px-2 pt-2 pb-1">
          ${['Lampu yang belum mati?', 'Parkir kosong?', 'Perangkat offline?'].map((s) => `<button type="button" class="btn btn-outline btn-sm" data-palette-suggest>${s}</button>`).join('')}
        </div>
      </form>
    </div>`;
}

function setupPalette() {
  document.body.insertAdjacentHTML('beforeend', paletteHtml());
  const el = document.querySelector('[data-palette]');
  const form = el.querySelector('form');
  const input = form.elements.q;
  const open = () => {
    el.classList.replace('hidden', 'flex');
    input.focus();
  };
  const close = () => el.classList.replace('flex', 'hidden');
  const go = (q) => {
    if (q.trim()) location.href = `/chatbot.html?q=${encodeURIComponent(q.trim())}`;
  };
  document.querySelectorAll('[data-palette-open]').forEach((b) => b.addEventListener('click', open));
  el.addEventListener('click', (e) => e.target === el && close());
  el.querySelectorAll('[data-palette-suggest]').forEach((b) => b.addEventListener('click', () => go(b.textContent)));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go(input.value);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open();
    }
    if (e.key === 'Escape') close();
  });
}

function setupMobileMenu(navbar) {
  const toggle = navbar.querySelector('[data-menu-toggle]');
  const menu = navbar.querySelector('#mobile-menu');
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('hidden') === false;
    toggle.setAttribute('aria-expanded', String(open));
  });
}

function startClock() {
  const el = document.querySelector('[data-clock]');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 15000);
}

/**
 * Pasang navbar atas. Setiap halaman HTML wajib punya <header id="navbar">.
 */
export function mountLayout({ page }) {
  const navbar = document.getElementById('navbar');
  navbar.innerHTML = navbarHtml(page);
  setupPalette();
  setupMobileMenu(navbar);
  startClock();
  renderIcons();
}
