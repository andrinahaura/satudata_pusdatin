// Perbandingan pemakaian model AI: porsi token (satu batang bertumpuk) lalu satu panel per model
// berisi token, pertanyaan, biaya, token / pertanyaan, dan biaya / pertanyaan. Dipakai Home dan Analitik chatbot.
import { esc } from '../utils/dom.js';
import { fmtCompact, fmtInt, fmtPct, fmtRupiah } from '../utils/format.js';

// Warna model mengikuti urutan tetap di MODELS: model pertama navy, kedua kuning.
const MODEL_COLORS = ['bg-ink', 'bg-accent'];

/** c = hasil summarizeChat(). */
export function modelUsageHtml(c) {
  const models = c.byModel.map((m, i) => ({ ...m, color: MODEL_COLORS[i % MODEL_COLORS.length], share: c.tokens ? m.tokens / c.tokens : 0 }));
  const bar = models
    .filter((m) => m.share > 0)
    .map((m, i, list) => `<div class="${m.color} ${i === 0 ? 'rounded-l-full' : ''} ${i === list.length - 1 ? 'rounded-r-full' : ''}" style="width:${(m.share * 100).toFixed(1)}%" title="${m.model}: ${fmtPct(m.share)} token"></div>`)
    .join('');
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
  return `
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-mid-gray">Porsi token</span>
      <span class="font-medium tabular-nums">${fmtCompact(c.tokens)} token · ${fmtRupiah(c.rupiah)}</span>
    </div>
    <div class="mt-2 flex h-2.5 gap-0.5" role="img" aria-label="${esc(models.map((m) => `${m.model} ${fmtPct(m.share)}`).join(', '))}">${bar}</div>
    <div class="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">${panels}</div>`;
}
