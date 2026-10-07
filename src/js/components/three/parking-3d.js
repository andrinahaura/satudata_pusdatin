// Ilustrasi 3D Smart Parking (parkir susun): rangka bertingkat, satu palet per slot,
// mobil di slot yang terisi, dan label tingkat. Tingkat = zone.rows, slot per tingkat = zone.cols.
// Slot ke-i ada di tingkat floor(i / cols), kolom i % cols (sama dengan ilustrasi 2D).
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { esc } from '../../utils/dom.js';
import { slotTooltip } from '../parking-site.js';
import { createScene3D, disposeGroup, mat, PALETTE } from './scene.js';

const BAY_W = 48; // lebar satu slot
const BAY_D = 78; // kedalaman satu slot
const LEVEL_H = 44; // tinggi antar tingkat
const POST = 3; // tebal tiang rangka
const LANE = 60; // jalur masuk di depan rak

/** Tata letak rak: posisi tiap slot (x, tingkat) dan ukuran keseluruhan. */
export function rackLayout(zone) {
  const width = zone.cols * BAY_W;
  const height = zone.rows * LEVEL_H;
  const slots = zone.slots.map((s, i) => ({ slot: s, level: Math.floor(i / zone.cols), col: i % zone.cols }));
  return { width, height, depth: BAY_D, slots, levels: zone.rows };
}

function car(THREE) {
  const v = new THREE.Group();
  const part = (w, h, d, color, y, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { roughness: 0.5 }));
    m.position.set(0, y, z);
    m.castShadow = true;
    v.add(m);
  };
  part(BAY_W - 14, 9, BAY_D - 20, PALETTE.inkSoft, 6.5);
  part(BAY_W - 18, 7, (BAY_D - 20) * 0.5, PALETTE.cabin, 14.5, 2);
  return v;
}

export function createParking3D(container) {
  const ctx = createScene3D(container, { height: 'clamp(320px, 38vw, 440px)', view: { dir: [-0.35, 0.6, 1], fit: [520, 260], target: [0, 50, 0] } });
  const { THREE, scene, tooltip, render, pick } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  let zone = null;
  let built = false;

  function build(next) {
    disposeGroup(group);
    const L = rackLayout(next);
    const x0 = -L.width / 2;
    const z0 = -L.depth / 2;

    // Lantai dasar + jalur masuk dengan marka putus-putus di depan rak.
    const ground = new THREE.Mesh(new THREE.BoxGeometry(L.width + 60, 6, L.depth + LANE + 30), mat(PALETTE.hairline));
    ground.position.set(0, -3, LANE / 2);
    ground.receiveShadow = true;
    group.add(ground);
    for (let x = x0 + 8; x < -x0 - 8; x += 22) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 2), mat(PALETTE.paper));
      dash.position.set(x + 6, 0.3, -z0 + LANE / 2);
      group.add(dash);
    }

    // Tiang rangka di setiap batas slot, depan dan belakang.
    const steel = mat(PALETTE.ink2, { roughness: 0.6 });
    const postH = L.height + 8;
    for (let c = 0; c <= next.cols; c++) {
      for (const z of [z0, -z0]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(POST, postH, POST), steel);
        post.position.set(x0 + c * BAY_W, postH / 2, z);
        post.castShadow = true;
        group.add(post);
      }
    }
    // Balok atas sepanjang rak.
    for (const z of [z0, -z0]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(L.width + POST, POST, POST), steel);
      beam.position.set(0, postH, z);
      group.add(beam);
    }

    // Palet per slot; mobil di atasnya bila terisi, nomor slot bila kosong.
    for (const { slot, level, col } of L.slots) {
      const y = level * LEVEL_H;
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(BAY_W - 4, 2, L.depth - 4), mat(slot.occupied ? PALETTE.line : PALETTE.paper));
      pallet.position.set(x0 + col * BAY_W + BAY_W / 2, y + 1, 0);
      pallet.receiveShadow = true;
      pallet.userData.slotId = slot.id;
      group.add(pallet);
      if (slot.occupied) {
        const v = car(THREE);
        v.position.set(pallet.position.x, y + 2, 0);
        v.traverse((o) => (o.userData.slotId = slot.id));
        group.add(v);
      } else {
        const el = document.createElement('div');
        el.innerHTML = `<span class="text-[11px] font-medium text-mid-gray">${esc(slot.id.split('-')[1])}</span>`;
        const label = new CSS2DObject(el);
        label.position.set(pallet.position.x, y + 4, -z0 - 8);
        group.add(label);
      }
    }

    // Label tingkat di sisi kiri rak.
    for (let level = 0; level < L.levels; level++) {
      const el = document.createElement('div');
      el.innerHTML = `<span class="badge bg-paper text-ink shadow-card">Tingkat ${level + 1}</span>`;
      const label = new CSS2DObject(el);
      label.position.set(x0 - 30, level * LEVEL_H + 10, -z0);
      group.add(label);
    }
    return L;
  }

  const canvas = ctx.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    if (!zone || e.buttons) return;
    const slotId = pick(e, [group])?.userData.slotId;
    canvas.style.cursor = slotId ? 'pointer' : 'grab';
    if (!slotId) return tooltip.hide();
    tooltip.show(slotTooltip(zone, slotId), e);
  });
  canvas.addEventListener('pointerleave', () => tooltip.hide());

  return {
    /** @param {object} next zona parkir (satu lokasi Smart Parking) */
    update(next) {
      zone = next;
      const L = build(next);
      if (!built) {
        built = true;
        ctx.setView({ dir: [-0.35, 0.6, 1], fit: [L.width + 120, L.height + LANE + 80], target: [0, L.height / 2, LANE / 3] });
      }
      render();
    },
  };
}
