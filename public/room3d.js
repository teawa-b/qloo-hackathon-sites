// Walk inside a Roomful room in 3D. The room is a GLB made once from the painting (Hunyuan World on fal, then
// scripts/world-to-glb.js): a 360-degree mesh with baked colours, so it needs no lights and costs nothing to walk.
// WASD walks, drag or arrow keys look; on a headset, Enter VR. The on-screen keys light up as they are pressed.
// jsDelivr's +esm builds rewrite the loader's bare "three" import to the same URL, so both share one copy.
const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/+esm');
const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js/+esm');
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const name = params.get('room') || '';
// Only rooms shipped with the site: /img/<name>.glb.
const file = /^[a-z0-9-]{1,60}$/.test(name) ? `/img/${name}.glb` : null;
$('w3-name').textContent = params.get('name') || '';

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1d1218);
const camera = new THREE.PerspectiveCamera(85, 1, 0.02, 60);
// The rig is what walks; the camera turns inside it (and, in VR, the headset moves it).
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
let yaw = 0, pitch = 0;
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

if (!file) { $('w3-load').querySelector('p').textContent = 'No 3D room here yet.'; throw new Error('no room'); }
const gltf = await new GLTFLoader().loadAsync(file, e => { if (e.total) $('w3-progress').style.width = `${Math.round(100 * e.loaded / e.total)}%`; });
// Hunyuan World meshes are Z-up; three.js is Y-up.
gltf.scene.rotation.x = -Math.PI / 2;
gltf.scene.traverse(o => { if (o.isMesh) { o.material.vertexColors = true; o.material.side = THREE.DoubleSide; } });
scene.add(gltf.scene);
$('w3-load').hidden = true;

// Keys: walking and looking; the matching on-screen key lights up.
const held = new Set();
const key = (k, on) => { const el = document.querySelector(`[data-k="${k}"]`); if (el) el.classList.toggle('on', on); on ? held.add(k) : held.delete(k); };
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) { e.preventDefault(); key(k, true); } });
addEventListener('keyup', e => key(e.key.toLowerCase(), false));
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag[0]) * 0.004; pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', () => { drag = null; });

// The room is reconstructed around where the painting was "taken"; stay within this radius so it holds together.
const RADIUS = 0.35, SPEED = 0.45, TURN = 1.1;
const clock = new THREE.Clock(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
let manual = false;
const step = dt => {
  if (held.has('arrowleft')) yaw += TURN * dt; if (held.has('arrowright')) yaw -= TURN * dt;
  if (held.has('arrowup')) pitch = Math.min(1.2, pitch + TURN * dt); if (held.has('arrowdown')) pitch = Math.max(-1.2, pitch - TURN * dt);
  if (!renderer.xr.isPresenting) camera.rotation.set(pitch, yaw, 0, 'YXZ');
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); side.set(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3();
  if (held.has('w')) move.add(fwd); if (held.has('s')) move.sub(fwd); if (held.has('d')) move.add(side); if (held.has('a')) move.sub(side);
  if (move.lengthSq()) { rig.position.addScaledVector(move.normalize(), SPEED * dt); const r = Math.hypot(rig.position.x, rig.position.z); if (r > RADIUS) rig.position.multiplyScalar(RADIUS / r); }
};
renderer.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), 0.05); if (!manual) step(dt); renderer.render(scene, camera); });

// Headsets: an immersive session puts you in the room at standing eye level.
if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
  $('w3-vr').hidden = false;
  $('w3-vr').addEventListener('click', async () => {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
  });
}
// For filming: press and release keys from a script, and advance time one video frame at a time so the walk
// plays at real speed however slowly the frames are captured.
window.walk = { press: k => key(k, true), release: k => key(k, false), look: (y, p = 0) => { yaw = y; pitch = p; }, frame: dt => { manual = true; step(dt); renderer.render(scene, camera); } };
