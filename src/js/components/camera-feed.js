// Kartu kamera CCTV dengan overlay bounding box hasil deteksi.
// Jika backend mengirim camera.streamUrl (MJPEG/HLS snapshot), gambar asli ditampilkan
// di bawah overlay; jika tidak, dipakai latar placeholder.
import { esc } from '../utils/dom.js';

function sceneSvg() {
  // Garis marka parkir sebagai ilustrasi frame.
  return `<svg viewBox="0 0 100 56" preserveAspectRatio="none" class="absolute inset-0 size-full" aria-hidden="true">
    <path d="M0 48 L100 40 M0 18 L100 14" stroke="#262626" stroke-width="0.4" fill="none"/>
    ${Array.from({ length: 7 }, (_, i) => `<path d="M${i * 16 + 2} 48 L${i * 16 + 8} 18" stroke="#262626" stroke-width="0.4"/>`).join('')}
  </svg>`;
}

function boxesHtml(detections) {
  // Label kelas ada di ringkasan kartu; di dalam box cukup confidence.
  return detections
    .map(({ label, confidence, box: [x, y, w, h] }) => `
      <div class="absolute rounded-[4px] border-[1.5px] border-surface-alt" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%">
        <span class="absolute top-0 left-0 max-w-full truncate rounded-br-[3px] bg-surface-alt px-1 text-[10px] leading-[14px] font-medium text-ink" title="${esc(label)} ${Math.round(confidence * 100)}%">${Math.round(confidence * 100)}%</span>
      </div>`)
    .join('');
}

export function cameraCardHtml(cam) {
  const counts = cam.detections.reduce((acc, d) => ((acc[d.label] = (acc[d.label] || 0) + 1), acc), {});
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'Tidak ada objek';
  const media = cam.streamUrl ? `<img src="${esc(cam.streamUrl)}" alt="" class="absolute inset-0 size-full object-cover" />` : sceneSvg();
  return `
    <article class="card overflow-hidden">
      <div class="relative aspect-video overflow-hidden rounded-t-[23px] bg-ink-soft">
        ${media}
        ${boxesHtml(cam.detections)}
        <div class="absolute top-3 left-3 flex items-center gap-1.5">
          <span class="badge bg-surface-alt text-ink"><span class="dot ${cam.online ? 'bg-ink' : 'bg-mid-gray'}"></span>${cam.online ? 'Rekam' : 'Offline'}</span>
        </div>
        <span class="absolute top-3 right-3 font-mono tabular-nums text-[11px] text-surface-alt/70">${esc(cam.id)}</span>
      </div>
      <div class="flex items-center justify-between gap-2 px-4 py-3">
        <div class="min-w-0">
          <p class="truncate font-medium">${esc(cam.name)}</p>
          <p class="truncate text-caption tracking-normal text-mid-gray">${esc(summary)}</p>
        </div>
      </div>
    </article>`;
}
