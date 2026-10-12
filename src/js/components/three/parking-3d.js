// Ilustrasi 3D gedung parkir, mengikuti Smart Parking: gedung tertutup setinggi zone.levels lantai,
// fasad putih dengan jalur kaca dan panel tanaman, gate di lantai dasar muka depan dan belakang
// (zone.gates), jalur masuk di depan dan belakang. Bila ada lebih dari satu gedung, gedung berjajar (bukan
// peta lokasi). Isi gedung dan letak slot tidak digambar karena yang diketahui hanya jumlahnya;
// slot tersedia muncul di tooltip saat gedung disorot.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { esc } from '../../utils/dom.js';
import { FACADE, facadeCells, facadeCols, slotStatus, zoneTooltip } from '../parking-site.js';
import { createScene3D, disposeGroup, mat, PALETTE } from './scene.js';

const COL_W = 15; // lebar satu kolom panel fasad (satu gate = 2 kolom)
const DEPTH = 130; // kedalaman gedung
const GROUND_H = 30; // tinggi lantai dasar (gate)
const FLOOR_H = 28; // tinggi satu lantai di atasnya
const CORNICE = 5; // lis atap
const APRON = 36; // lebar jalur masuk di depan/belakang gedung
const GAP = 80; // jarak antar gedung
const PAD = 60; // tepi pelataran

const gatesOf = (z) => z.gates ?? { front: 4, back: 4 };
const widthOf = (z) => facadeCols(gatesOf(z).front) * COL_W;
const heightOf = (z) => GROUND_H + (z.levels - 1) * FLOOR_H + CORNICE;
const rowWidth = (list) => list.reduce((s, z) => s + widthOf(z), 0) + Math.max(0, list.length - 1) * GAP;

function viewFor(list) {
  const h = Math.max(60, ...list.map(heightOf)) + 30; // + ruang label nama di atas atap
  return { dir: [-0.55, 0.38, 1], fit: [rowWidth(list) + PAD, DEPTH + APRON * 2, h], target: [0, h * 0.42, 0] };
}

// Material fasad di-cache per ukuran supaya pembaruan realtime tidak membuat texture baru.
const facadeCache = new Map();
function facadeMat(cols, rows) {
  const key = `${cols}x${rows}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const CW = 32;
  const RH = 60; // sebanding FLOOR_H / COL_W x CW
  const c = document.createElement('canvas');
  c.width = cols * CW;
  c.height = rows * RH;
  const g = c.getContext('2d');
  const { glass, plants } = facadeCells(cols, rows);
  g.fillStyle = FACADE.wall;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = FACADE.glass;
  for (const col of glass) g.fillRect(col * CW + 6, 0, CW - 12, c.height);
  for (const { r, c: col } of plants) {
    // Dua kotak tanaman bertumpuk per sel, seperti di foto gedung.
    for (const [y, h] of [[8, 20], [32, 20]]) {
      g.fillStyle = FACADE.plantDark;
      g.fillRect(col * CW + 5, r * RH + y, CW - 10, h);
      g.fillStyle = FACADE.plant;
      g.fillRect(col * CW + 7, r * RH + y + 2, CW - 14, h - 6);
    }
  }
  g.fillStyle = FACADE.slab;
  for (let r = 1; r < rows; r++) g.fillRect(0, r * RH - 2, c.width, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
  facadeCache.set(key, m);
  return m;
}

function nameLabel(text, x, y, z, tone = 'default') {
  const cls = { default: 'text-ink bg-paper shadow-card', alert: 'badge-alert bg-paper shadow-card' }[tone];
  const el = document.createElement('div');
  el.innerHTML = `<span class="badge ${cls}">${esc(text)}</span>`;
  const label = new CSS2DObject(el);
  label.position.set(x, y, z);
  return label;
}

export function createParking3D(container) {
  const ctx = createScene3D(container, { height: 'clamp(360px, 42vw, 520px)', view: viewFor([{ levels: 11 }]) });
  const { scene, tooltip, render, pick, setView } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  let zones = [];

  function box(w, h, d, material, x, y, z, parent = group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function building(z, cx) {
    const b = new THREE.Group();
    const W = widthOf(z);
    const gates = gatesOf(z);
    const upper = z.levels - 1;
    const upperH = upper * FLOOR_H;
    const wall = mat(PALETTE.paper);
    const dark = mat(PALETTE.inkSoft, { roughness: 0.6 });

    // Lantai dasar sedikit menjorok, gate berupa bukaan gelap dengan lampu penanda di atasnya.
    box(W - 4, GROUND_H, DEPTH - 4, wall, 0, GROUND_H / 2, 0, b);
    for (const [n, side] of [[gates.front, 1], [gates.back, -1]]) {
      const gw = W / n;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + gw * (i + 0.5);
        box(gw - 6, GROUND_H - 6, 1, dark, x, (GROUND_H - 6) / 2, side * (DEPTH / 2 - 1.5), b);
        box(gw - 14, 1.6, 1, mat(PALETTE.accent), x, GROUND_H - 3, side * (DEPTH / 2 - 1.5), b);
      }
    }

    // Lantai atas: fasad bertekstur di keempat sisi, atap abu-abu, lis atap putih.
    const front = facadeMat(facadeCols(gates.front), upper);
    const side = facadeMat(Math.round(DEPTH / COL_W), upper);
    const roof = mat(PALETTE.line);
    box(W, upperH, DEPTH, [side, side, roof, wall, front, front], 0, GROUND_H + upperH / 2, 0, b);
    box(W + 6, CORNICE, DEPTH + 6, wall, 0, GROUND_H + upperH + CORNICE / 2, 0, b);
    box(W * 0.3, 8, DEPTH * 0.3, roof, -W * 0.2, GROUND_H + upperH + CORNICE + 4, 0, b);

    b.position.x = cx;
    b.traverse((o) => (o.userData.zoneId = z.id));
    group.add(b);

    const { alert, label } = slotStatus(z);
    group.add(nameLabel(alert ? `${z.name} · ${label}` : z.name, cx, heightOf(z) + 22, 0, alert ? 'alert' : 'default'));
  }

  function build(list) {
    disposeGroup(group);
    const rw = rowWidth(list);

    // Pelataran polos dengan jalur masuk di depan dan belakang gedung.
    box(rw + PAD * 2, 4, DEPTH + APRON * 2 + PAD, mat(PALETTE.canvas), 0, -2, 0).castShadow = false;
    for (const side of [1, -1]) box(rw + PAD, 0.6, APRON - 4, mat(PALETTE.hairline), 0, 0.3, side * (DEPTH / 2 + APRON / 2)).castShadow = false;

    let x = -rw / 2;
    for (const z of list) {
      building(z, x + widthOf(z) / 2);
      x += widthOf(z) + GAP;
    }
    // Hover langsung akurat walau frame render berikutnya belum jalan (raycast butuh matriks dunia).
    group.updateMatrixWorld(true);
  }

  const canvas = ctx.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    if (!zones.length || e.buttons) return;
    const z = zones.find((x) => x.id === pick(e, [group])?.userData.zoneId);
    canvas.style.cursor = z ? 'pointer' : 'grab';
    if (!z) return tooltip.hide();
    tooltip.show(zoneTooltip(z), e);
  });
  canvas.addEventListener('pointerleave', () => tooltip.hide());

  return {
    /** @param {{ zones: object[] }} next zones = summarizeParking().zones */
    update(next) {
      // Kamera hanya diatur ulang bila susunan gedung berubah, agar sudut pandang pengguna tidak hilang tiap pembaruan.
      const shape = (list) => list.map((z) => `${z.id}:${z.levels}`).join();
      if (shape(next.zones) !== shape(zones)) setView(viewFor(next.zones));
      zones = next.zones;
      build(zones);
      render();
    },
  };
}
