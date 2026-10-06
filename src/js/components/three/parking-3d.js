// Peta parkir 3D per zona: marka slot, jalur, kendaraan hasil deteksi, dan tiang CCTV.
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { VEHICLE_TYPES } from '../../data/device-types.js';
import { esc } from '../../utils/dom.js';
import { fmtTime } from '../../utils/format.js';
import { createScene3D, disposeGroup, hatchTexture, mat, PALETTE } from './scene.js';

function slotGeometry(zone) {
  const car = zone.kind === 'car';
  return { w: car ? 44 : 26, h: car ? 76 : 46, gap: 4, lane: car ? 56 : 36 };
}

// Posisi slot: baris berpasangan dengan jalur kendaraan di antaranya (sama dengan peta 2D).
export function zoneLayout(zone) {
  const g = slotGeometry(zone);
  const width = zone.cols * (g.w + g.gap) - g.gap + 32;
  const rowY = [];
  const lanes = [];
  let y = 8;
  for (let r = 0; r < zone.rows; r++) {
    if (r % 2 === 0) {
      lanes.push(y + g.lane / 2);
      y += g.lane;
    } else {
      y += g.gap;
    }
    rowY.push(y);
    y += g.h;
  }
  if (zone.rows % 2 === 0) {
    lanes.push(y + g.lane / 2);
    y += g.lane;
  }
  const height = y + 8;
  const slots = zone.slots.map((s, i) => ({
    slot: s,
    x: 16 + (i % zone.cols) * (g.w + g.gap),
    y: rowY[Math.floor(i / zone.cols)],
  }));
  return { g, width, height, lanes, slots };
}

export function createParking3D(container) {
  const ctx = createScene3D(container, { height: 'clamp(320px, 42vw, 460px)', view: { dir: [-0.2, 1, 0.95], fit: [800, 300] } });
  const { THREE, scene, tooltip, render, pick } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  const hatch = hatchTexture(1);
  const reservedMat = new THREE.MeshStandardMaterial({ map: hatch, roughness: 0.9 });
  let zone = null;
  let zoneId = null;

  function vehicle(type, w, d) {
    const v = new THREE.Group();
    const part = (bw, bh, bd, color, y, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat(color, { roughness: 0.5 }));
      m.position.set(0, y, z);
      m.castShadow = true;
      v.add(m);
      return m;
    };
    if (type === 'motorcycle') {
      part(6, 9, d - 14, PALETTE.inkSoft, 6.5);
      part(8, 4, 10, PALETTE.cabin, 13, -2);
    } else if (type === 'truck') {
      part(w - 10, 18, d - 24, PALETTE.inkSoft, 11, 4);
      part(w - 12, 12, 14, PALETTE.cabin, 8, -(d - 14) / 2 + 2);
    } else {
      part(w - 12, 9, d - 16, PALETTE.inkSoft, 6.5);
      part(w - 16, 7, (d - 16) * 0.5, PALETTE.cabin, 14.5, 2);
    }
    return v;
  }

  function cctvPole(x, z, cam) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 64, 10), mat(PALETTE.muted));
    pole.position.set(x, 32, z);
    pole.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 6), mat(cam.online ? PALETTE.inkSoft : PALETTE.ember));
    head.position.set(x + 4, 64, z + 3);
    head.rotation.y = -Math.PI / 4;
    const el = document.createElement('div');
    el.innerHTML = `<span class="badge bg-paper text-ink shadow-card"><span class="dot ${cam.online ? 'bg-ember' : 'bg-mid-gray'}"></span>${esc(cam.id)}</span>`;
    const label = new CSS2DObject(el);
    label.position.set(x, 80, z);
    group.add(pole, head, label);
  }

  function build(next, cameras) {
    disposeGroup(group);
    const L = zoneLayout(next);
    const X = (px) => px - L.width / 2;
    const Z = (py) => py - L.height / 2;

    const ground = new THREE.Mesh(new THREE.BoxGeometry(L.width, 6, L.height), mat(PALETTE.hairline));
    ground.position.y = -3;
    ground.receiveShadow = true;
    ground.add(new THREE.LineSegments(new THREE.EdgesGeometry(ground.geometry), new THREE.LineBasicMaterial({ color: PALETTE.off })));
    group.add(ground);

    for (const ly of L.lanes) {
      for (let x = 24; x < L.width - 24; x += 22) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 2), mat(PALETTE.paper));
        dash.position.set(X(x + 6), 0.3, Z(ly));
        group.add(dash);
      }
    }

    for (const { slot, x, y } of L.slots) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(L.g.w - 2, 0.8, L.g.h - 2), slot.reserved && !slot.occupied ? reservedMat : mat(PALETTE.paper));
      pad.position.set(X(x + L.g.w / 2), 0.4, Z(y + L.g.h / 2));
      pad.receiveShadow = true;
      pad.userData.slotId = slot.id;
      group.add(pad);

      if (slot.occupied) {
        const v = vehicle(slot.vehicleType, L.g.w, L.g.h);
        v.position.set(pad.position.x, 0.8, pad.position.z);
        v.traverse((o) => (o.userData.slotId = slot.id));
        group.add(v);
      } else {
        const el = document.createElement('div');
        const tag = slot.reserved === 'disabilitas' ? 'D' : slot.reserved === 'pimpinan' ? 'P' : slot.id.split('-')[1];
        el.innerHTML = `<span class="text-[11px] font-medium text-mid-gray">${tag}</span>`;
        const label = new CSS2DObject(el);
        label.position.set(pad.position.x, 2, pad.position.z);
        group.add(label);
      }
    }

    cameras.filter((c) => c.zoneId === next.id).forEach((cam) => cctvPole(X(24), Z(10), cam));
    return L;
  }

  const canvas = ctx.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    if (!zone || e.buttons) return;
    const slotId = pick(e, [group])?.userData.slotId;
    canvas.style.cursor = slotId ? 'pointer' : 'grab';
    if (!slotId) return tooltip.hide();
    const s = zone.slots.find((x) => x.id === slotId);
    const reserved = s.reserved ? ` · khusus ${s.reserved}` : '';
    const body = s.occupied
      ? `${VEHICLE_TYPES[s.vehicleType]?.label ?? 'Kendaraan'} · ${esc(s.plate)}<br><span class="opacity-70">Parkir sejak ${fmtTime(s.since)}</span>`
      : '<span class="opacity-70">Kosong</span>';
    tooltip.show(`<div class="font-medium">Slot ${esc(s.id)}${reserved}</div>${body}`, e);
  });
  canvas.addEventListener('pointerleave', () => tooltip.hide());

  return {
    /** @param {object} next zona parkir  @param {object[]} cameras */
    update(next, cameras = []) {
      zone = next;
      const L = build(next, cameras);
      if (next.id !== zoneId) {
        zoneId = next.id;
        ctx.setView({ dir: [-0.2, 1, 0.95], fit: [L.width, L.height] });
      }
      render();
    },
  };
}
