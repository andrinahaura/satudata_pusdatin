// Diagram distribusi listrik: trafo induk mengalir ke panel output tiap lantai
// dan panel kipas. Tiap meter menampilkan beban, energi hari ini, biaya, dan V/A/cos φ.
import { esc } from '../utils/dom.js';
import { fmt1, fmtInt } from '../utils/format.js';

const fmt2 = (n) => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statHtml = (label, value) => `<div><dt class="text-caption tracking-normal text-mid-gray">${label}</dt><dd class="font-semibold tabular-nums">${value}</dd></div>`;
const statusHtml = (p) => (p.online ? '' : '<span class="badge badge-alert">Offline</span>');
const readingHtml = (p) => `${fmt1(p.voltage)} V · ${fmt1(p.current)} A · cos φ ${fmt2(p.pf)}`;

function meterCard(p, tariff) {
  return `<div class="h-full rounded-nested border border-hairline bg-paper p-4">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate font-medium">${esc(p.name)}</p>
        <p class="truncate text-caption tracking-normal text-mid-gray">${esc(p.meter)}</p>
      </div>
      ${statusHtml(p)}
    </div>
    <dl class="mt-3 grid grid-cols-3 gap-2">
      ${statHtml('Beban', `${fmt1(p.kw)} kW`)}
      ${statHtml('Hari ini', `${fmt1(p.kwhToday)} kWh`)}
      ${statHtml('Biaya', `Rp ${fmtInt(Math.round(p.kwhToday * tariff))}`)}
    </dl>
    <p class="mt-2 text-caption tracking-normal text-mid-gray tabular-nums">${readingHtml(p)}</p>
  </div>`;
}

// Trafo induk: satu baris lebar penuh supaya tidak menyisakan ruang kosong di samping.
function sourceCard(p, tariff) {
  return `<div class="flex flex-col gap-3 rounded-nested border border-ink bg-paper p-4 md:flex-row md:items-center md:justify-between">
    <div class="flex items-start justify-between gap-3 md:justify-start">
      <div class="min-w-0">
        <p class="font-medium">${esc(p.name)}</p>
        <p class="text-caption tracking-normal text-mid-gray">${esc(p.meter)} · ${readingHtml(p)}</p>
      </div>
      ${statusHtml(p)}
    </div>
    <dl class="grid grid-cols-3 gap-x-8 gap-y-2">
      ${statHtml('Beban', `${fmt1(p.kw)} kW`)}
      ${statHtml('Hari ini', `${fmt1(p.kwhToday)} kWh`)}
      ${statHtml('Biaya', `Rp ${fmtInt(Math.round(p.kwhToday * tariff))}`)}
    </dl>
  </div>`;
}

export function powerFlowHtml(energy) {
  const source = energy.panels.find((p) => p.source);
  const outputs = energy.panels.filter((p) => !p.source);
  // lg: busbar horizontal dari tengah kartu pertama ke tengah kartu terakhir (gap-3 = 0.75rem).
  const bus = 'lg:before:absolute lg:before:top-0 lg:before:right-[calc((100%-2.25rem)/8)] lg:before:left-[calc((100%-2.25rem)/8)] lg:before:h-px lg:before:bg-ink';
  const stub = 'lg:pt-5 lg:before:absolute lg:before:top-0 lg:before:left-1/2 lg:before:h-5 lg:before:w-px lg:before:bg-ink';
  return `<div class="flex flex-col">
    ${sourceCard(source, energy.tariff)}
    <div class="mx-auto h-5 w-px bg-ink" aria-hidden="true"></div>
    <ul class="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${bus}" aria-label="Panel output">
      ${outputs.map((p) => `<li class="relative ${stub}">${meterCard(p, energy.tariff)}</li>`).join('')}
    </ul>
  </div>`;
}
