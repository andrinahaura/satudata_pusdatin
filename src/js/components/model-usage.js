// Perbandingan pemakaian model AI: porsi token (satu batang bertumpuk) lalu satu panel per model
// berisi token, pertanyaan, biaya, token / pertanyaan, dan biaya / pertanyaan. Dipakai Home dan Analitik chatbot.
import { USD_TO_IDR } from '../data/chat-models.js';
import { esc } from '../utils/dom.js';
import { fmtCompact, fmtInt, fmtPct, fmtRupiah } from '../utils/format.js';
import { icon } from './icons.js';

// Warna model mengikuti urutan tetap di MODELS: model pertama navy, kedua kuning.
const MODEL_COLORS = ['bg-ink', 'bg-accent'];

/**
 * Biaya dalam dolar dengan ikon. Nilai di bawah 1 sen memakai 4 desimal supaya tidak tampil 0,00.
 * Ikon perlu renderIcons() setelah HTML dipasang.
 */
export function dollarHtml(rupiah) {
  const usd = rupiah / USD_TO_IDR;
  const digits = usd > 0 && usd < 0.01 ? 4 : 2;
  const value = usd.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `<span class="inline-flex items-center align-middle"><span class="sr-only">USD </span>${icon('dollar-sign', 'size-3')}${value}</span>`;
}

// Tabel ringkas untuk kolom sempit di Home: satu kolom untuk satu jenis angka, baris Total di bawah.
function compactTable(c, models) {
  const row = (name, tokens, share, rupiah, total = false) => `<tr class="${total ? 'border-t border-hairline font-medium' : ''}">
      <th scope="row" class="py-0.5 pr-1 text-left ${total ? 'font-medium' : 'font-normal'}">${name}</th>
      <td class="px-1 text-right lg:max-xl:px-0.5">${fmtInt(tokens)}</td>
      <td class="px-1 text-right lg:max-xl:px-0.5 text-mid-gray">${share}</td>
      <td class="px-1 text-right lg:max-xl:px-0.5">${dollarHtml(rupiah)}</td>
      <td class="pl-1 text-right lg:max-xl:pl-0.5 text-mid-gray">${fmtRupiah(rupiah)}</td>
    </tr>`;
  return `<table class="mt-1 w-full whitespace-nowrap tabular-nums lg:max-xl:text-[11px]">
      <thead class="text-mid-gray"><tr>
        <th scope="col" class="pr-1 text-left font-normal">Model</th>
        <th scope="col" class="px-1 text-right lg:max-xl:px-0.5 font-normal">Token</th>
        <th scope="col" class="px-1 text-right lg:max-xl:px-0.5 font-normal"><span class="lg:max-xl:hidden">Persentase</span><span class="hidden lg:max-xl:inline">%</span></th>
        <th scope="col" class="px-1 text-right lg:max-xl:px-0.5 font-normal">Dolar</th>
        <th scope="col" class="pl-1 text-right lg:max-xl:pl-0.5 font-normal">Rupiah</th>
      </tr></thead>
      <tbody>
        ${models.map((m) => row(`<span class="flex items-center gap-1.5 whitespace-nowrap"><span class="dot ${m.color}"></span>${esc(m.model)}</span>`, m.tokens, fmtPct(m.share), m.rupiah)).join('')}
        ${row('Total', c.tokens, '100%', c.rupiah, true)}
      </tbody>
    </table>`;
}

/**
 * c = hasil summarizeChat().
 * compact = batang porsi token dan tabel ringkas tanpa panel rincian, untuk kolom sempit di Home. Ikon dolar perlu renderIcons().
 */
export function modelUsageHtml(c, { compact = false } = {}) {
  const models = c.byModel.map((m, i) => ({ ...m, color: MODEL_COLORS[i % MODEL_COLORS.length], share: c.tokens ? m.tokens / c.tokens : 0 }));
  const bar = models
    .filter((m) => m.share > 0)
    .map((m, i, list) => `<div class="${m.color} ${i === 0 ? 'rounded-l-full' : ''} ${i === list.length - 1 ? 'rounded-r-full' : ''}" style="width:${(m.share * 100).toFixed(1)}%" title="${m.model}: ${fmtPct(m.share)} token"></div>`)
    .join('');
  const barLabel = esc(models.map((m) => `${m.model} ${fmtPct(m.share)}`).join(', '));
  if (compact) return `<div class="mt-1.5 flex h-1.5 gap-0.5" role="img" aria-label="${barLabel}">${bar}</div>${compactTable(c, models)}`;
  const stat = (label, value) => `<div><dt class="text-caption tracking-normal text-mid-gray">${label}</dt><dd class="mt-0.5 font-semibold tabular-nums">${value}</dd></div>`;
  const panels = models
    .map((m) => `<section class="flex flex-col justify-between rounded-nested border border-hairline p-4">
        <div>
          <div class="flex items-center justify-between gap-2">
            <h4 class="flex min-w-0 items-center gap-2 font-semibold"><span class="dot ${m.color}"></span><span class="truncate">${esc(m.model)}</span></h4>
            <span class="badge badge-soft">${fmtPct(m.share)}</span>
          </div>
          <p class="stat-value mt-3">${fmtCompact(m.tokens)}<span class="ml-1 text-body font-medium text-mid-gray">token</span></p>
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-3">
          ${stat('Pertanyaan', fmtInt(m.questions))}
          ${stat('Biaya', fmtRupiah(m.rupiah))}
          ${stat('Token / pertanyaan', fmtInt(m.questions ? Math.round(m.tokens / m.questions) : 0))}
          ${stat('Biaya / pertanyaan', fmtRupiah(m.questions ? m.rupiah / m.questions : 0))}
        </dl>
      </section>`)
    .join('');
  const heading = `<span class="text-mid-gray">Total</span><span class="font-medium tabular-nums">${fmtCompact(c.tokens)} token · ${fmtRupiah(c.rupiah)}</span>`;
  return `
    <div class="flex items-baseline justify-between gap-3">${heading}</div>
    <div class="mt-2 flex h-2.5 gap-0.5" role="img" aria-label="${barLabel}">${bar}</div>
    <div class="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">${panels}</div>`;
}
