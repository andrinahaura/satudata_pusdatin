// Ilustrasi 3D gedung parkir, mengikuti Smart Parking: rangka baja terbuka berisi mobil 3D. Muka depan dan
// belakang masing-masing punya satu menara per gerbang setinggi zone.slotsPerGate, mobil menghadap ke dalam
// sehingga bagian belakangnya terlihat dari luar. Sisi samping polos abu-abu. Bila ada lebih dari satu
// gedung, gedung berjajar (bukan peta lokasi). Jumlah slot tersedia muncul saat menara disorot.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hex } from '../../theme.js';
import { esc } from '../../utils/dom.js';
import { CAR_COLOR, FACADE, facadeCols, slotStatus, towerRows, towerTooltip } from '../parking-site.js';
import { createScene3D, disposeGroup, mat, PALETTE } from './scene.js';

const COL_W = 15; // lebar satu kolom muka gedung (satu gerbang = 2 kolom)
const DEPTH = 132; // kedalaman gedung: dua baris slot saling membelakangi
const GROUND_H = 30; // tinggi lantai dasar (gerbang)
const ROW_H = 16; // tinggi satu slot pada menara
const CORNICE = 5; // lis atap
const APRON = 36; // lebar jalur masuk di depan/belakang gedung
const GAP = 80; // jarak antar gedung
const PAD = 60; // tepi pelataran
const BAY_D = DEPTH / 2 - 4; // kedalaman satu slot
const STEEL = 2; // tebal kolom dan balok rangka

const gatesOf = (z) => z.gates ?? { front: 4, back: 4 };
const widthOf = (z) => facadeCols(gatesOf(z).front) * COL_W;
const upperOf = (z) => (z.slotsPerGate ?? 24) * ROW_H;
const heightOf = (z) => GROUND_H + upperOf(z) + CORNICE;
const rowWidth = (list) => list.reduce((s, z) => s + widthOf(z), 0) + Math.max(0, list.length - 1) * GAP;

function viewFor(list) {
  const h = Math.max(60, ...list.map(heightOf)) + 30; // + ruang label nama di atas atap
  return { dir: [-0.5, 0.3, 1], fit: [rowWidth(list) + PAD, DEPTH + APRON * 2, h], target: [0, h * 0.46, 0] };
}

/* Mobil dibuat sekali lalu digandakan dengan InstancedMesh supaya ratusan mobil tetap ringan.
   Titik asal di lantai slot, sumbu +z menuju bagian belakang mobil. */
const part = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const CAR = (() => {
  const W = 21;
  const L = 46;
  const wheel = (x, z) => new THREE.CylinderGeometry(2.4, 2.4, 2.4, 12).rotateZ(Math.PI / 2).translate(x, 2.4, z);
  const paint = mergeGeometries([
    new RoundedBoxGeometry(W, 5.4, L, 2, 1.2).translate(0, 4.8, 0),
    new RoundedBoxGeometry(W - 3, 4.6, L * 0.5, 2, 1.2).translate(0, 8.8, -1),
  ].map((g) => g.toNonIndexed()));
  const dark = mergeGeometries([
    part(W - 5, 3.4, 0.5, 0, 9, L * 0.25 - 0.9),
    ...[[-W / 2 + 1.2, L / 2 - 8], [W / 2 - 1.2, L / 2 - 8], [-W / 2 + 1.2, -L / 2 + 8], [W / 2 - 1.2, -L / 2 + 8]].map(([x, z]) => wheel(x, z)),
  ].map((g) => g.toNonIndexed()));
  const lamp = mergeGeometries([part(4.4, 1.5, 0.5, -W / 2 + 3.4, 5.6, L / 2 + 0.05), part(4.4, 1.5, 0.5, W / 2 - 3.4, 5.6, L / 2 + 0.05)]);
  const plate = part(5.4, 1.5, 0.5, 0, 3.8, L / 2 + 0.05);
  return { paint, dark, lamp, plate };
})();

function nameLabel(text, x, y, z, tone = 'default') {
  const cls = { default: 'text-ink bg-paper shadow-card', alert: 'badge-alert bg-paper shadow-card' }[tone];
  const el = document.createElement('div');
  el.innerHTML = `<span class="badge ${cls}">${esc(text)}</span>`;
  const label = new CSS2DObject(el);
  label.position.set(x, y, z);
  return label;
}

export function createParking3D(container) {
  const ctx = createScene3D(container, { height: 'clamp(420px, 46vw, 560px)', view: viewFor([{ gates: { front: 8, back: 8 } }]) });
  const { scene, tooltip, render, pick, setView } = ctx;
  const group = new THREE.Group();
  const hits = new THREE.Group(); // bidang tak terlihat untuk hover; mobil tidak ikut di-raycast.
  scene.add(group, hits);
  let zones = [];
  let cars = new Map(); // zone.id -> { mesh, tint }

  const hidden = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.14, depthWrite: false }));
  glow.visible = false;
  scene.add(glow);

  function box(w, h, d, material, x, y, z, parent = group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Rangka baja: kolom tiap batas gerbang dan balok tiap tingkat, di muka depan dan belakang.
  function frame(z, parent) {
    const W = widthOf(z);
    const upperH = upperOf(z);
    const rows = z.slotsPerGate;
    const steel = mat(hex(FACADE.steel), { roughness: 0.55 });
    const deck = mat(hex(FACADE.deck));
    const dummy = new THREE.Object3D();

    for (const [n, face] of [[gatesOf(z).front, 1], [gatesOf(z).back, -1]]) {
      const gw = W / n;
      for (let i = 0; i <= n; i++) box(STEEL, upperH, STEEL, steel, -W / 2 + gw * i, GROUND_H + upperH / 2, face * (DEPTH / 2 - 1), parent);
      const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(W, 1.2, STEEL), steel, rows + 1);
      const decks = new THREE.InstancedMesh(new THREE.BoxGeometry(W - STEEL, 1, BAY_D), deck, rows);
      for (let r = 0; r <= rows; r++) {
        dummy.position.set(0, GROUND_H + r * ROW_H, face * (DEPTH / 2 - 1));
        dummy.updateMatrix();
        beams.setMatrixAt(r, dummy.matrix);
        if (r === rows) continue;
        dummy.position.set(0, GROUND_H + r * ROW_H + 0.5, face * (DEPTH / 4 + 1));
        dummy.updateMatrix();
        decks.setMatrixAt(r, dummy.matrix);
      }
      decks.receiveShadow = true;
      parent.add(beams, decks);
    }
  }

  function building(z, cx) {
    const b = new THREE.Group();
    const W = widthOf(z);
    const gates = gatesOf(z);
    const upperH = upperOf(z);
    const side = mat(hex(FACADE.side));
    const wall = mat(PALETTE.paper);
    const spine = mat(hex(FACADE.spine));
    const list = { 1: z.towers.filter((t) => t.side === 'front'), '-1': z.towers.filter((t) => t.side === 'back') };

    // Lantai dasar, dinding tengah, sisi polos abu-abu, dan atap.
    box(W - 2, GROUND_H, DEPTH - 2, [side, side, wall, wall, wall, wall], 0, GROUND_H / 2, 0, b);
    box(W - 2, upperH, 6, spine, 0, GROUND_H + upperH / 2, 0, b);
    for (const dir of [1, -1]) box(1.6, upperH, DEPTH, side, dir * (W / 2 - 0.2), GROUND_H + upperH / 2, 0, b);
    box(W + 6, CORNICE, DEPTH + 6, wall, 0, GROUND_H + upperH + CORNICE / 2, 0, b);
    box(W * 0.3, 8, DEPTH * 0.3, mat(hex(FACADE.side)), -W * 0.2, GROUND_H + upperH + CORNICE + 4, 0, b);
    frame(z, b);

    // Pintu gerbang, lampu penanda, dan bidang hover setinggi menara.
    const total = z.towers.length;
    const meshes = [CAR.paint, CAR.dark, CAR.lamp, CAR.plate].map((geo, i) => {
      const material = i === 0 ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }) : mat([0, hex('#1b2233'), hex('#7a1218'), 0xffffff][i], { roughness: 0.5 });
      const mesh = new THREE.InstancedMesh(geo, material, total * z.slotsPerGate);
      mesh.frustumCulled = false;
      b.add(mesh);
      return mesh;
    });
    const dummy = new THREE.Object3D();
    let index = 0;
    for (const [n, face] of [[gates.front, 1], [gates.back, -1]]) {
      const gw = W / n;
      const towers = list[face];
      for (let i = 0; i < n; i++) {
        const t = towers[i];
        const x = face * (-W / 2 + gw * (i + 0.5));
        const outer = face * (DEPTH / 2 + 0.3);
        const door = new THREE.Mesh(new THREE.PlaneGeometry(gw - 6, GROUND_H - 8), mat(hex(FACADE.door), { roughness: 0.7 }));
        door.position.set(x, (GROUND_H - 8) / 2, outer);
        door.rotation.y = face > 0 ? 0 : Math.PI;
        b.add(door);
        box(gw - 12, 1.6, 1, mat(PALETTE.accent), x, GROUND_H - 4, outer, b);
        const hit = new THREE.Mesh(new THREE.PlaneGeometry(gw, GROUND_H + upperH), hidden);
        hit.position.set(x + cx, (GROUND_H + upperH) / 2, face * (DEPTH / 2 + 1));
        hit.rotation.y = door.rotation.y;
        hit.userData = { zoneId: z.id, gate: t.code };
        hits.add(hit);
        for (let r = 0; r < t.total; r++) {
          dummy.position.set(x, GROUND_H + r * ROW_H + 1, face * (DEPTH / 4 + 1));
          dummy.rotation.y = face > 0 ? 0 : Math.PI;
          dummy.updateMatrix();
          for (const mesh of meshes) mesh.setMatrixAt(index, dummy.matrix);
          index += 1;
        }
      }
    }
    cars.set(z.id, meshes[0]);

    b.position.x = cx;
    group.add(b);

    const { alert, label } = slotStatus(z);
    group.add(nameLabel(alert ? `${z.name} · ${label}` : z.name, cx, heightOf(z) + 22, 0, alert ? 'alert' : 'default'));
  }

  // Warna mobil diperbarui tanpa membangun ulang gedung. Urutan sama dengan urutan di building().
  const tint = new THREE.Color();
  function paint(list) {
    for (const z of list) {
      const mesh = cars.get(z.id);
      let index = 0;
      for (const face of ['front', 'back']) {
        for (const t of z.towers.filter((x) => x.side === face)) {
          for (const color of towerRows(t)) mesh.setColorAt(index++, tint.set(color));
        }
      }
      mesh.instanceColor.needsUpdate = true;
    }
  }

  function build(list) {
    disposeGroup(group);
    disposeGroup(hits);
    cars = new Map();
    const rw = rowWidth(list);

    // Pelataran polos dengan jalur masuk di depan dan belakang gedung.
    box(rw + PAD * 2, 4, DEPTH + APRON * 2 + PAD, mat(PALETTE.canvas), 0, -2, 0).castShadow = false;
    for (const side of [1, -1]) box(rw + PAD, 0.6, APRON - 4, mat(PALETTE.hairline), 0, 0.3, side * (DEPTH / 2 + APRON / 2)).castShadow = false;

    let x = -rw / 2;
    for (const z of list) {
      building(z, x + widthOf(z) / 2);
      x += widthOf(z) + GAP;
    }
    group.updateMatrixWorld(true);
    hits.updateMatrixWorld(true);
  }

  const canvas = ctx.renderer.domElement;
  function hover(hit) {
    glow.visible = Boolean(hit);
    if (hit) {
      glow.geometry.dispose();
      glow.geometry = hit.geometry.clone();
      glow.position.copy(hit.position);
      glow.rotation.copy(hit.rotation);
    }
    render();
  }
  let hovered = null;
  canvas.addEventListener('pointermove', (e) => {
    if (!zones.length || e.buttons) return;
    const hit = pick(e, [hits]);
    const t = zones.find((x) => x.id === hit?.userData.zoneId)?.towers.find((x) => x.code === hit.userData.gate);
    canvas.style.cursor = t ? 'pointer' : 'grab';
    if (hit !== hovered) {
      hovered = hit;
      hover(hit);
    }
    if (!t) return tooltip.hide();
    tooltip.show(towerTooltip(t), e);
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    hover(null);
    tooltip.hide();
  });

  return {
    /** @param {{ zones: object[] }} next zones = summarizeParking().zones */
    update(next) {
      // Gedung hanya dibangun ulang bila susunannya berubah; pembaruan realtime cukup mewarnai ulang mobil.
      const shape = (list) => list.map((z) => `${z.id}:${z.towers.length}:${slotStatus(z).alert}`).join();
      const view = (list) => list.map((z) => z.id).join();
      if (view(next.zones) !== view(zones)) setView(viewFor(next.zones));
      const rebuild = shape(next.zones) !== shape(zones);
      zones = next.zones;
      if (rebuild) {
        hovered = null;
        glow.visible = false;
        build(zones);
      }
      paint(zones);
      render();
    },
  };
}
