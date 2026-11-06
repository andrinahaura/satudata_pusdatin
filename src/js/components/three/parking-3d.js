// Ilustrasi 3D gedung parkir, mengikuti Smart Parking: rangka baja dengan panel penutup. Muka depan dan
// belakang masing-masing punya satu menara per gerbang setinggi levelsOf(), dua slot per tingkat dengan lift di
// tengah. Slot tersedia terbuka dan berisi mobil yang menghadap ke dalam sehingga bagian belakangnya terlihat dari
// luar. Slot terisi tertutup panel. Jumlah slot tersedia tertulis di pintu gerbang.
// Sisi samping polos abu-abu. Bila ada lebih dari satu gedung, gedung berjajar (bukan peta lokasi).
// Jumlah slot tersedia muncul saat menara disorot.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hex } from '../../theme.js';
import { esc } from '../../utils/dom.js';
import { CAR_COLOR, CARS_PER_ROW, carRows, FACADE, facadeCols, levelsOf, slotStatus, towerTooltip } from '../parking-site.js';
import { createScene3D, disposeGroup, mat, PALETTE } from './scene.js';

const COL_W = 37; // lebar satu kolom muka gedung (satu gerbang = 2 kolom)
const DEPTH = 132; // kedalaman gedung: dua baris slot saling membelakangi
const GROUND_H = 30; // tinggi lantai dasar (gerbang)
const LAMP_H = 2; // lampu penanda di atas pintu, menempel di bawah panel dan lift
const ROW_H = 22; // tinggi satu tingkat pada menara
const CORNICE = 5; // lis atap
const APRON = 36; // lebar jalur masuk di depan/belakang gedung
const GAP = 80; // jarak antar gedung
const PAD = 60; // tepi pelataran
const BAY_D = DEPTH / 2 - 4; // kedalaman satu slot
const STEEL = 2; // tebal kolom dan balok rangka
const LIFT_W = 14; // lebar lift di tengah menara
const TOWER_GAP = 6; // jarak antar menara: tiang terang, supaya tidak tertukar dengan lift yang gelap
const CAR_SCALE = [1.25, 1.5, 1.2]; // mobil diperbesar supaya mudah dihitung

const gatesOf = (z) => z.gates ?? { front: 4, back: 4 };
const widthOf = (z) => facadeCols(gatesOf(z).front) * COL_W;
const upperOf = (z) => levelsOf(z) * ROW_H;
const heightOf = (z) => GROUND_H + upperOf(z) + CORNICE;
const rowWidth = (list) => list.reduce((s, z) => s + widthOf(z), 0) + Math.max(0, list.length - 1) * GAP;

function viewFor(list) {
  const h = Math.max(60, ...list.map(heightOf)) + 30; // + ruang label nama di atas atap
  return { dir: [-0.5, 0.3, 1], fit: [rowWidth(list) + PAD, DEPTH + APRON * 2, h], target: [0, h * 0.46, 0] };
}

/* Mobil dibuat sekali lalu digandakan dengan InstancedMesh supaya ratusan slot tetap ringan.
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

// Material pintu berisi angka slot tersedia, satu per angka, dipakai ulang saat pembaruan realtime.
const doorCache = new Map();
function doorMat(count) {
  if (doorCache.has(count)) return doorCache.get(count);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = FACADE.door;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffffff';
  g.font = '700 84px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(count), c.width / 2, c.height / 2 + 4);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map });
  doorCache.set(count, material);
  return material;
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
  const ctx = createScene3D(container, { height: 'clamp(420px, 46vw, 560px)', view: viewFor([{ gates: { front: 4, back: 4 }, slotsPerGate: 24 }]) });
  const { scene, tooltip, render, pick, setView } = ctx;
  const group = new THREE.Group();
  const hits = new THREE.Group(); // bidang tak terlihat untuk hover; mobil tidak ikut di-raycast.
  scene.add(group, hits);
  let zones = [];
  let slots = new Map(); // zone.id -> { cars: InstancedMesh[], panels: InstancedMesh, spots: { gate, door, x, z, face, cell, places: Matrix4[] }[] }

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
    const rows = levelsOf(z);
    const steel = mat(hex(FACADE.steel), { roughness: 0.55 });
    const pillar = mat(hex(FACADE.wall));
    const deck = mat(hex(FACADE.deck));
    const dummy = new THREE.Object3D();

    for (const [n, face] of [[gatesOf(z).front, 1], [gatesOf(z).back, -1]]) {
      const gw = W / n;
      for (let i = 0; i <= n; i++) box(TOWER_GAP, upperH, 3, pillar, -W / 2 + gw * i, GROUND_H + upperH / 2, face * (DEPTH / 2 - 0.8), parent);
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
    const rows = levelsOf(z);
    const instanced = (geo, material, count) => {
      const mesh = new THREE.InstancedMesh(geo, material, count);
      mesh.frustumCulled = false;
      b.add(mesh);
      return mesh;
    };
    const meshes = [CAR.paint, CAR.dark, CAR.lamp, CAR.plate].map((geo, i) => instanced(geo, mat([hex(CAR_COLOR), hex('#1b2233'), hex('#7a1218'), 0xffffff][i], { roughness: i === 0 ? 0.45 : 0.5 }), total * rows * CARS_PER_ROW));
    // Dua panel per menara: bagian bawah, dan separuh baris di samping mobil ganjil.
    const panels = instanced(new THREE.BoxGeometry(W / gates.front - TOWER_GAP, 1, 1), mat(hex(FACADE.closed)), total * 2);
    const dummy = new THREE.Object3D();
    const spots = [];
    for (const [n, face] of [[gates.front, 1], [gates.back, -1]]) {
      const gw = W / n;
      const towers = list[face];
      for (let i = 0; i < n; i++) {
        const t = towers[i];
        const x = face * (-W / 2 + gw * (i + 0.5));
        const outer = face * (DEPTH / 2 + 0.3);
        // Lift: ruang luncur dari dinding tengah sampai muka gedung, kabin di tingkat paling bawah.
        const liftD = DEPTH / 2 - 2.1;
        box(LIFT_W - 1, upperH, liftD, spine, x, GROUND_H + upperH / 2, face * (3 + liftD / 2), b);
        box(LIFT_W - 4, ROW_H - 5, 0.4, mat(hex(FACADE.slab)), x, GROUND_H + ROW_H / 2, face * (DEPTH / 2 + 0.95), b);
        const door = new THREE.Mesh(new THREE.PlaneGeometry(gw - TOWER_GAP, GROUND_H - LAMP_H), doorMat(t.free));
        door.position.set(x, (GROUND_H - LAMP_H) / 2, outer);
        door.rotation.y = face > 0 ? 0 : Math.PI;
        b.add(door);
        box(gw - TOWER_GAP, LAMP_H, 1, mat(PALETTE.accent), x, GROUND_H - LAMP_H / 2, outer, b);
        const hit = new THREE.Mesh(new THREE.PlaneGeometry(gw, GROUND_H + upperH), hidden);
        hit.position.set(x + cx, (GROUND_H + upperH) / 2, face * (DEPTH / 2 + 1));
        hit.rotation.y = door.rotation.y;
        hit.userData = { zoneId: z.id, gate: t.code };
        hits.add(hit);
        // Tingkat 0 = paling atas, mobil mengisi dari atas, dari kiri bila dilihat dari luar.
        const cell = (gw - LIFT_W - TOWER_GAP) / CARS_PER_ROW; // lebar satu slot
        const sideX = (cell + LIFT_W) / 2; // jarak pusat slot dari pusat menara
        const places = Array.from({ length: rows * CARS_PER_ROW }, (_, n) => {
          const row = Math.floor(n / CARS_PER_ROW);
          const col = n % CARS_PER_ROW;
          dummy.position.set(x + face * (col ? sideX : -sideX), GROUND_H + (rows - row - 1) * ROW_H + 1, face * (DEPTH / 4 + 1));
          dummy.rotation.y = face > 0 ? 0 : Math.PI;
          dummy.scale.set(...CAR_SCALE);
          dummy.updateMatrix();
          return dummy.matrix.clone();
        });
        spots.push({ gate: t.code, door, x, z: face * (DEPTH / 2 + 0.2), face, cell, places });
      }
    }
    slots.set(z.id, { cars: meshes, panels, spots });

    b.position.x = cx;
    group.add(b);

    const { alert, label } = slotStatus(z);
    group.add(nameLabel(alert ? `${z.name} · ${label}` : z.name, cx, heightOf(z) + 22, 0, alert ? 'alert' : 'default'));
  }

  // Mobil dan panel diperbarui tanpa membangun ulang gedung. Baris tanpa mobil dan menara tanpa panel
  // diskalakan ke nol. Panel mengisi sisa tinggi menara di bawah mobil.
  const none = new THREE.Matrix4().makeScale(0, 0, 0);
  const shape = new THREE.Object3D();
  function paint(list) {
    for (const z of list) {
      const { cars, panels, spots } = slots.get(z.id);
      const rows = levelsOf(z);
      const place = (x, y, sx, h, z2) => {
        shape.position.set(x, y, z2);
        shape.scale.set(sx, h, 1);
        shape.updateMatrix();
        return shape.matrix;
      };
      let index = 0;
      spots.forEach((spot, i) => {
        const { free } = z.towers.find((t) => t.code === spot.gate);
        spot.door.material = doorMat(free);
        spot.places.forEach((matrix, n) => {
          for (const mesh of cars) mesh.setMatrixAt(index, n < free ? matrix : none);
          index += 1;
        });
        const filled = carRows(free);
        const h = (rows - filled) * ROW_H;
        panels.setMatrixAt(i * 2, h > 0 ? place(spot.x, GROUND_H + h / 2, 1, h, spot.z) : none);
        const odd = free % CARS_PER_ROW;
        const sideX = (spot.cell + LIFT_W) / 2;
        const scaleX = spot.cell / (spot.cell * CARS_PER_ROW + LIFT_W);
        panels.setMatrixAt(i * 2 + 1, odd ? place(spot.x + spot.face * sideX, GROUND_H + (rows - filled + 0.5) * ROW_H, scaleX, ROW_H, spot.z) : none);
      });
      for (const mesh of [...cars, panels]) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function build(list) {
    disposeGroup(group);
    disposeGroup(hits);
    slots = new Map();
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
      // Gedung hanya dibangun ulang bila susunannya berubah; pembaruan realtime cukup menukar mobil dan panel.
      const layout = (list) => list.map((z) => `${z.id}:${z.towers.length}:${slotStatus(z).alert}`).join();
      const view = (list) => list.map((z) => z.id).join();
      if (view(next.zones) !== view(zones)) setView(viewFor(next.zones));
      const rebuild = layout(next.zones) !== layout(zones);
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
