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
    <div class="mx-auto flex h-16 w-full max-w-[1680px] items-center gap-4 px-4 sm:px-5 lg:px-6">
      <a href="/" class="flex shrink-0 items-center gap-3">
        <span class="leading-tight max-sm:hidden">
          <span class="block text-body font-semibold">SatuData</span>
          <span class="block text-caption tracking-normal text-paper/60">Pusdatin Smart Building</span>
        </span>
      </a>

      <nav class="flex items-center gap-1 rounded-pill bg-paper/10 p-1 max-lg:hidden" aria-label="Menu utama">
        ${NAV.map(link).join('')}
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <span class="hidden text-body text-paper/70 tabular-nums sm:inline" data-clock></span>
        <button type="button" class="btn btn-on-dark btn-icon -mr-2 lg:hidden" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="Buka menu">${icon('menu')}</button>
      </div>
    </div>

    <div id="mobile-menu" class="hidden border-t border-paper/10 lg:hidden">
      <nav class="mx-auto flex max-w-[1680px] flex-col gap-1 px-4 py-3 sm:px-5" aria-label="Menu utama">
        ${NAV.map(link).join('')}
      </nav>
    </div>`;
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
  setupMobileMenu(navbar);
  startClock();
  renderIcons();
}
