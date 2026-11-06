import { icon, renderIcons } from './icons.js';

export const NAV = [
  { id: 'home', label: 'Home', href: '/', icon: 'layout-dashboard' },
  { id: 'iot', label: 'IoT & Kelistrikan', href: '/iot.html', icon: 'cpu' },
  { id: 'vision', label: 'AI Vision', href: '/vision.html', icon: 'car' },
  { id: 'chatbot', label: 'Chatbot', href: '/chatbot.html', icon: 'message-square' },
];

// Belum ada login: pengguna contoh sampai backend autentikasi siap, tombol Keluar belum melakukan apa pun.
const USER = { name: 'Admin Demo', role: 'Admin', initials: 'AD' };

function userHtml() {
  return `<div class="flex items-center gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-semibold text-ink" aria-hidden="true">${USER.initials}</span>
      <span class="leading-tight whitespace-nowrap">
        <span class="block text-body font-semibold">${USER.name}</span>
        <span class="block text-caption tracking-normal text-paper/60">${USER.role}</span>
      </span>
    </div>`;
}

const logoutHtml = `<button type="button" class="btn btn-on-dark px-2 text-paper" title="Login belum tersedia">${icon('log-out', 'size-5')}Keluar</button>`;

function navbarHtml(active) {
  const link = (n, cls) => `<a href="${n.href}" class="${cls}" ${n.id === active ? 'aria-current="page"' : ''}>${icon(n.icon, 'size-5')}${n.label}</a>`;
  return `
    <div class="mx-auto flex h-16 w-full max-w-[1680px] items-stretch gap-5 px-4 sm:px-5 lg:px-6">
      <a href="/" class="flex shrink-0 items-center">
        <span class="leading-tight whitespace-nowrap max-sm:hidden">
          <span class="block text-body font-semibold">SatuData</span>
          <span class="block text-caption tracking-normal text-paper/60">Pusat Data dan Teknologi Informasi</span>
        </span>
      </a>
      <span class="nav-divider max-lg:hidden"></span>

      <nav class="flex items-stretch gap-1 max-lg:hidden" aria-label="Menu utama">
        ${NAV.map((n) => link(n, 'nav-tab')).join('')}
      </nav>

      <div class="ml-auto flex min-w-0 items-center gap-4">
        <div class="max-lg:hidden">${userHtml()}</div>
        <span class="nav-divider max-lg:hidden"></span>
        <div class="max-lg:hidden">${logoutHtml}</div>
        <button type="button" class="btn btn-on-dark btn-icon -mr-2 lg:hidden" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="Buka menu">${icon('menu')}</button>
      </div>
    </div>

    <div id="mobile-menu" class="hidden border-t border-paper/10 lg:hidden">
      <nav class="mx-auto flex max-w-[1680px] flex-col gap-1 px-4 pt-3 sm:px-5" aria-label="Menu utama">
        ${NAV.map((n) => link(n, 'nav-link')).join('')}
      </nav>
      <div class="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">${userHtml()}${logoutHtml}</div>
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

/**
 * Pasang navbar atas. Setiap halaman HTML wajib punya <header id="navbar">.
 */
export function mountLayout({ page }) {
  const navbar = document.getElementById('navbar');
  navbar.innerHTML = navbarHtml(page);
  setupMobileMenu(navbar);
  renderIcons();
}
