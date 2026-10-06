// Denah lantai 3D: lantai, dinding dengan bukaan pintu ke koridor, dan perangkat IoT
// sebagai objek 3D. Koordinat sama dengan denah 2D (viewBox 1000 x 560).
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DEVICE_TYPES } from '../../data/device-types.js';
import { esc } from '../../utils/dom.js';
import { roomMeta, roomNumber } from '../floor-plan.js';
import { createScene3D, disposeGroup, hatchTexture, mat, PALETTE } from './scene.js';

const WALL_H = 30;
const WALL_T = 4;
const DOOR_W = 34;
const CORRIDOR_EDGES = new Set([250, 310]);
const X = (px) => px - 500;
const Z = (py) => py - 280;

const DEVICE_Y = { light: 22, ac: 24, sensor: 8, presence: 10 };

function stateMaterial(d, dimmed) {
  const opacity = dimmed ? 0.12 : 1;
  if (!d.online) return mat(PALETTE.ember, { opacity, roughness: 0.5 });
  return d.on ? mat(PALETTE.accent, { opacity, roughness: 0.4 }) : mat(PALETTE.line, { opacity });
}

export function createFloorPlan3D(container, { onRoomSelect } = {}) {
  const ctx = createScene3D(container, { height: 'clamp(340px, 52vw, 560px)', view: { dir: [-0.2, 1, 0.95], fit: [1000, 560], target: [0, 0, 10] } });
  const { THREE, scene, tooltip, render, pick, onClick } = ctx;

  const geo = {
    light: new THREE.SphereGeometry(5, 20, 14),
    glow: new THREE.CircleGeometry(18, 32),
    ac: new THREE.BoxGeometry(18, 7, 8),
    sensor: new THREE.OctahedronGeometry(5.5),
    presence: new THREE.ConeGeometry(5, 11, 18),
  };
  const hatch = hatchTexture(6);
  const tileMats = {
    room: mat(PALETTE.paper),
    corridor: mat(PALETTE.canvas),
    hover: mat(PALETTE.canvas),
    selected: mat(PALETTE.hairline),
    service: new THREE.MeshStandardMaterial({ map: hatch, roughness: 0.9 }),
  };

  const roomsGroup = new THREE.Group();
  const devicesGroup = new THREE.Group();
  scene.add(roomsGroup, devicesGroup);

  // Pelat dasar gedung.
  const base = new THREE.Mesh(new THREE.BoxGeometry(980, 8, 540), mat(PALETTE.paper));
  base.position.y = -4.5;
  base.receiveShadow = true;
  const baseEdges = new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), new THREE.LineBasicMaterial({ color: PALETTE.ink }));
  base.add(baseEdges);
  scene.add(base);

  let current = null;
  let floorId = null;
  let hoverRoomId = null;
  const tiles = new Map();
  const labelEls = new Map();

  function tileMaterial(room) {
    if (room.id === current?.selectedRoomId) return tileMats.selected;
    if (room.id === hoverRoomId) return tileMats.hover;
    if (room.type === 'corridor') return tileMats.corridor;
    if (room.type === 'toilet' || room.type === 'core') return tileMats.service;
    return tileMats.room;
  }

  function addWall(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1) return;
    const horizontal = z1 === z2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len + WALL_T : WALL_T, WALL_H, horizontal ? WALL_T : len + WALL_T), mat(PALETTE.alt));
    wall.position.set(X((x1 + x2) / 2), WALL_H / 2, Z((z1 + z2) / 2));
    wall.castShadow = true;
    wall.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wall.geometry.parameters.width, 1.2, wall.geometry.parameters.depth), mat(PALETTE.ink2));
    cap.position.y = WALL_H / 2 + 0.6;
    wall.add(cap);
    roomsGroup.add(wall);
  }

  function buildRooms(floor) {
    disposeGroup(roomsGroup);
    tiles.clear();
    labelEls.clear();
    const seen = new Set();
    const segment = (x1, y1, x2, y2, door) => {
      const key = [x1, y1, x2, y2].join(',');
      if (seen.has(key)) return;
      seen.add(key);
      if (!door) return addWall(x1, y1, x2, y2);
      // Bukaan pintu dekat sisi kiri ruangan.
      const d1 = x1 + 20;
      addWall(x1, y1, d1, y2);
      addWall(d1 + DOOR_W, y1, x2, y2);
    };

    for (const room of floor.rooms) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(room.w - 4, 1, room.h - 4), tileMaterial(room));
      tile.position.set(X(room.x + room.w / 2), 0.5, Z(room.y + room.h / 2));
      tile.receiveShadow = true;
      tile.userData.roomId = room.type === 'core' ? null : room.id;
      tiles.set(room.id, { tile, room });
      roomsGroup.add(tile);

      if (room.type === 'corridor') {
        // Koridor bisa terbagi beberapa segmen; dinding hanya di ujung gedung.
        if (room.x === 20) segment(room.x, room.y, room.x, room.y + room.h);
        if (room.x + room.w === 980) segment(room.x + room.w, room.y, room.x + room.w, room.y + room.h);
        continue;
      }
      const { x, y, w, h } = room;
      const open = room.type !== 'core';
      segment(x, y, x + w, y, open && CORRIDOR_EDGES.has(y));
      segment(x, y + h, x + w, y + h, open && CORRIDOR_EDGES.has(y + h));
      segment(x, y, x, y + h);
      segment(x + w, y, x + w, y + h);

      if (room.type === 'core') {
        // Shaft lift.
        const size = Math.min(52, w - 10);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(size, WALL_H + 14, size), mat(PALETTE.hairline));
        shaft.position.set(X(x + w / 2), (WALL_H + 14) / 2, Z(y + h / 2 + 10));
        shaft.castShadow = true;
        roomsGroup.add(shaft);
      }

      // Ruang sempit cukup diberi nomor; nama & status terbaca lewat tooltip.
      if (w < 140 && !roomNumber(room)) continue;
      const el = document.createElement('div');
      el.style.cssText = 'width:0;height:0';
      el.innerHTML = '<div class="absolute top-0 left-0 rounded-small bg-paper/90 px-1.5 py-0.5 text-[12px] leading-tight whitespace-nowrap shadow-card"></div>';
      labelEls.set(room.id, el.firstElementChild);
      const label = new CSS2DObject(el);
      label.position.set(X(x + 10), WALL_H + 4, Z(y + 10));
      roomsGroup.add(label);
    }
  }

  function updateLabels(floor) {
    for (const room of floor.rooms) {
      const el = labelEls.get(room.id);
      if (!el) continue;
      el.innerHTML = room.w < 140
        ? `<div class="font-medium text-ink">${esc(roomNumber(room))}</div>`
        : `<div class="font-medium text-ink">${esc(room.name)}</div><div class="text-mid-gray">${esc(roomMeta(room))}</div>`;
      el.classList.toggle('ring-1', room.id === current.selectedRoomId);
      el.classList.toggle('ring-ink', room.id === current.selectedRoomId);
    }
  }

  function buildDevices({ floor, devices, filter }) {
    disposeGroup(devicesGroup, { sharedGeometry: true });
    for (const d of devices.filter((x) => x.floorId === floor.id)) {
      const dimmed = filter !== 'all' && d.type !== filter;
      const mesh = new THREE.Mesh(geo[d.type], stateMaterial(d, dimmed));
      mesh.position.set(X(d.x), DEVICE_Y[d.type], Z(d.y));
      if (d.type === 'cctv') mesh.rotation.x = Math.PI;
      mesh.castShadow = !dimmed;
      mesh.userData.deviceId = d.id;
      devicesGroup.add(mesh);
      if (d.type === 'light' && d.on && d.online && !dimmed) {
        const glow = new THREE.Mesh(geo.glow, mat(PALETTE.accent, { opacity: 0.2 }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(X(d.x), 1.2, Z(d.y));
        devicesGroup.add(glow);
      }
    }
  }

  function refreshTiles() {
    for (const { tile, room } of tiles.values()) tile.material = tileMaterial(room);
  }

  const canvas = ctx.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    if (!current || e.buttons) return;
    const hit = pick(e, [devicesGroup, roomsGroup]);
    const deviceId = hit?.userData.deviceId;
    const roomId = hit?.userData.roomId ?? null;
    canvas.style.cursor = deviceId || roomId ? 'pointer' : 'grab';
    if (roomId !== hoverRoomId) {
      hoverRoomId = roomId;
      refreshTiles();
      render();
    }
    if (!deviceId) {
      const room = current.floor.rooms.find((r) => r.id === roomId);
      if (!room) return tooltip.hide();
      return tooltip.show(`<div class="font-medium">${esc(room.name)}</div><div class="opacity-70">${esc(roomMeta(room))}</div>`, e);
    }
    const d = current.devices.find((x) => x.id === deviceId);
    const room = current.floor.rooms.find((r) => r.id === d.roomId);
    const meta = DEVICE_TYPES[d.type];
    const state = !d.online ? 'Offline' : d.on ? meta.onLabel : meta.offLabel;
    tooltip.show(`<div class="font-medium">${esc(d.name)} · ${esc(room.name)}</div><div class="opacity-70">${esc(state)}${d.on && d.online ? ` · ${meta.watt} W` : ''}</div>`, e);
  });
  canvas.addEventListener('pointerleave', () => {
    tooltip.hide();
    hoverRoomId = null;
    refreshTiles();
    render();
  });

  onClick((e) => {
    const hit = pick(e, [devicesGroup, roomsGroup]);
    const deviceId = hit?.userData.deviceId;
    const roomId = deviceId ? current.devices.find((d) => d.id === deviceId)?.roomId : hit?.userData.roomId;
    if (roomId && onRoomSelect) onRoomSelect(roomId);
  });

  return {
    update(opts) {
      current = { filter: 'all', selectedRoomId: null, ...opts };
      if (opts.floor.id !== floorId) {
        floorId = opts.floor.id;
        buildRooms(opts.floor);
      }
      refreshTiles();
      updateLabels(opts.floor);
      buildDevices(current);
      render();
    },
  };
}
