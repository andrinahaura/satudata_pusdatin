// Kerangka scene 3D bersama (Three.js) untuk denah lantai dan peta parkir.
// Render on-demand (tidak ada loop terus-menerus) supaya hemat CPU/baterai.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { COLORS, hex } from '../../theme.js';
import { createTooltip } from '../../utils/dom.js';
import { icon, renderIcons } from '../icons.js';

export const PALETTE = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, hex(v)]));

const materialCache = new Map();
/** Material standar yang di-cache per warna/opacity. */
export function mat(color, { opacity = 1, emissive = 0x000000, roughness = 0.85 } = {}) {
  const key = `${color}-${opacity}-${emissive}-${roughness}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, emissive, transparent: opacity < 1, opacity }));
  }
  return materialCache.get(key);
}

/** Kosongkan group. Geometri bersama (dipakai ulang) jangan di-dispose: sharedGeometry = true. */
export function disposeGroup(group, { sharedGeometry = false } = {}) {
  group.traverse((o) => {
    if (o.geometry && !sharedGeometry) o.geometry.dispose();
    if (o.isCSS2DObject) o.element.remove();
  });
  group.clear();
}

/** Texture arsir diagonal untuk area khusus (toilet, lift, slot reservasi). */
export function hatchTexture(repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = COLORS.alt;
  g.fillRect(0, 0, 32, 32);
  g.strokeStyle = COLORS.line;
  g.lineWidth = 3;
  for (let i = -32; i < 64; i += 10) {
    g.beginPath();
    g.moveTo(i, 32);
    g.lineTo(i + 32, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {HTMLElement} container
 * view.dir = arah kamera dari target, view.fit = [lebar, kedalaman] objek yang harus muat di layar.
 * @param {{ height?: number|string, view: { dir: number[], fit: number[], target?: number[] } }} opts
 */
export function createScene3D(container, opts) {
  container.classList.add('relative');
  container.innerHTML = `
    <div class="relative overflow-hidden rounded-nested bg-surface-alt" data-viewport style="height:${typeof opts.height === 'number' ? `${opts.height}px` : opts.height ?? '480px'}">
      <div class="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button type="button" class="btn btn-outline btn-icon size-8 bg-paper" data-zoom="in" aria-label="Perbesar">${icon('plus', 'size-4')}</button>
        <button type="button" class="btn btn-outline btn-icon size-8 bg-paper" data-zoom="out" aria-label="Perkecil">${icon('minus', 'size-4')}</button>
        <button type="button" class="btn btn-outline btn-icon size-8 bg-paper" data-view="top" aria-label="Tampak atas">${icon('square', 'size-4')}</button>
        <button type="button" class="btn btn-outline btn-icon size-8 bg-paper" data-view="reset" aria-label="Reset tampilan">${icon('rotate-ccw', 'size-4')}</button>
      </div>
      <p class="pointer-events-none absolute bottom-3 left-3 z-10 rounded-pill bg-paper/90 px-2.5 py-1 text-caption tracking-normal text-mid-gray max-sm:hidden">Seret untuk memutar · klik kanan untuk geser · ⌘/Ctrl + scroll untuk zoom</p>
    </div>`;
  renderIcons(container);
  const viewport = container.querySelector('[data-viewport]');
  const tooltip = createTooltip(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.classList.add('block', 'size-full', 'outline-none');
  viewport.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'pointer-events-none absolute inset-0';
  viewport.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);

  scene.add(new THREE.HemisphereLight(0xffffff, PALETTE.line, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-380, 700, 420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -700, right: 700, top: 500, bottom: -500, near: 10, far: 2000 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2.4;
  controls.minDistance = 150;
  controls.maxDistance = 3000;
  controls.enableZoom = false;

  let view = opts.view;
  let frame = 0;
  const render = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer.render(scene, camera);
      labels.render(scene, camera);
    });
  };
  controls.addEventListener('change', render);

  // Jarak kamera dicari agar ke-8 sudut kotak fit[0] x tinggi x fit[1] muat di viewport (margin ~3%).
  function fitPosition(v) {
    const [w, d] = v.fit;
    const target = new THREE.Vector3(...(v.target ?? [0, 0, 0]));
    const dir = new THREE.Vector3(...v.dir).normalize();
    const corners = [];
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) for (const y of [0, 40]) corners.push(new THREE.Vector3(x, y, z).add(target));
    let dist = Math.max(w, d) * 1.5;
    for (let i = 0; i < 4; i++) {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const extent = Math.max(...corners.map((c) => {
        const p = c.clone().project(camera);
        return Math.max(Math.abs(p.x), Math.abs(p.y));
      }));
      dist *= extent / 0.97;
    }
    return dir.multiplyScalar(dist);
  }

  let userMoved = false;
  controls.addEventListener('start', () => (userMoved = true));

  function setView(v = view, top = false) {
    view = v;
    userMoved = false;
    const target = new THREE.Vector3(...(v.target ?? [0, 0, 0]));
    const offset = fitPosition(v);
    controls.target.copy(target);
    if (top) camera.position.copy(target).add(new THREE.Vector3(0, offset.length(), 0.01));
    else camera.position.copy(target).add(offset);
    camera.lookAt(target);
    controls.update();
    render();
  }

  function dolly(factor) {
    const dir = camera.position.clone().sub(controls.target).multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(dir.length(), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(dir.setLength(len));
    controls.update();
    render();
  }

  // Zoom roda mouse hanya dengan ⌘/Ctrl (atau pinch trackpad) agar scroll halaman tetap normal.
  viewport.addEventListener('wheel', (e) => {
    controls.enableZoom = e.ctrlKey || e.metaKey;
  }, { capture: true, passive: true });

  viewport.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    const v = e.target.closest('[data-view]');
    if (z) dolly(z.dataset.zoom === 'in' ? 0.8 : 1.25);
    if (v) setView(view, v.dataset.view === 'top');
  });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = viewport;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved) setView(view);
    render();
  };
  new ResizeObserver(resize).observe(viewport);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  /** Objek terdekat di bawah pointer dari daftar objects (rekursif). */
  function pick(event, objects) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(objects, true)[0]?.object ?? null;
  }

  // Bedakan klik dengan drag (memutar kamera).
  let down = null;
  function onClick(handler) {
    renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) handler(e);
      down = null;
    });
  }

  setView(view);
  resize();

  return { THREE, scene, camera, renderer, controls, tooltip, viewport, render, setView, pick, onClick };
}
