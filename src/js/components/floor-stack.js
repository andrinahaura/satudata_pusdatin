// Potongan gedung: daftar lantai disusun dari atas (lantai tertinggi) ke bawah.
import { summarizeIot } from '../services/selectors.js';
import { esc } from '../utils/dom.js';
import { fmt1 } from '../utils/format.js';
import { icon } from './icons.js';

export function floorStackHtml(iot, selectedFloorId) {
  const floors = [...iot.building.floors].sort((a, b) => b.level - a.level);
  const items = floors
    .map((f) => {
      const s = summarizeIot(iot, f.id);
      const active = s.byType.light.on + s.byType.ac.on;
      const controllable = s.byType.light.total + s.byType.ac.total;
      const pct = controllable ? Math.round((active / controllable) * 100) : 0;
      const selected = f.id === selectedFloorId;
      return `
        <button type="button" data-floor-id="${f.id}" aria-pressed="${selected}"
          class="w-full cursor-pointer rounded-nested border p-3 text-left transition-colors ${selected ? 'border-ink bg-paper shadow-card' : 'border-hairline bg-surface-alt hover:bg-paper'}">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold">${esc(f.name)}</span>
            ${s.offline ? `<span class="badge badge-alert">${s.offline} offline</span>` : '<span class="badge badge-soft">Normal</span>'}
          </div>
          <p class="text-caption tracking-normal text-mid-gray">${esc(f.label)}</p>
          <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption tracking-normal text-mid-gray">
            <span class="inline-flex items-center gap-1">${icon('lightbulb', 'size-3.5')}${s.byType.light.on}/${s.byType.light.total}</span>
            <span class="inline-flex items-center gap-1">${icon('users', 'size-3.5')}${s.people}</span>
            <span class="inline-flex items-center gap-1">${icon('thermometer', 'size-3.5')}${fmt1(s.avgTemp)}°</span>
          </div>
          <div class="mt-2 h-1 overflow-hidden rounded-full bg-canvas" title="${pct}% lampu & AC menyala">
            <div class="h-full rounded-full bg-ink" style="width:${pct}%"></div>
          </div>
        </button>`;
    })
    .join('');
  return `
    <div class="flex flex-col gap-2">
      <svg viewBox="0 0 200 22" class="h-5 w-full" aria-hidden="true" preserveAspectRatio="none">
        <path d="M6 21 L100 3 L194 21" fill="none" stroke="#0a0a0a" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>
      ${items}
      <div class="flex items-center gap-2 border-t-2 border-ink pt-2 text-caption tracking-normal text-mid-gray">${icon('square-parking', 'size-3.5')}Ground · Area parkir</div>
    </div>`;
}
