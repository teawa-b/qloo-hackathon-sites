// AR/VR heads-up for Talk: a panel that floats about a metre in front of you and lazily follows your
// gaze, drawn to a canvas so it stays crisp in the headset. Passthrough AR on Quest when available,
// otherwise immersive VR. Holding either trigger marks the lines as yours.
const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');

const W = 1024, H = 640;
function draw(ctx, view) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(11,7,18,0.82)'; roundRect(ctx, 0, 0, W, H, 48); ctx.fill();
  ctx.fillStyle = '#71f0bd'; ctx.font = '500 26px "DM Mono", monospace'; ctx.fillText('OPENHERE · TALK', 48, 66);
  const nudges = view?.nudges || [];
  let y = 140;
  if (!nudges.length) { ctx.fillStyle = '#c9c2b1'; ctx.font = '600 40px "Bricolage Grotesque", sans-serif'; wrap(ctx, 'Listening for what they love…', 48, y, W - 96, 50); }
  nudges.slice(0, 2).forEach((n, i) => {
    ctx.fillStyle = i ? '#e8e1d8' : '#ffffff'; ctx.font = `${i ? 600 : 800} ${i ? 38 : 54}px "Bricolage Grotesque", sans-serif`;
    y = wrap(ctx, n.say, 48, y, W - 96, i ? 46 : 62) + 8;
    ctx.fillStyle = '#71f0bd'; ctx.font = '500 24px "DM Mono", monospace'; ctx.fillText(`${n.about} · ${n.why}`.slice(0, 70), 48, y); y += 64;
  });
  const them = (view?.them || []).slice(0, 6).map(e => e.name).join('  ·  ');
  if (them) { ctx.fillStyle = '#ffe276'; ctx.font = '500 24px "DM Mono", monospace'; ctx.fillText('THEY LOVE', 48, H - 70); ctx.fillStyle = '#ffffff'; ctx.font = '600 28px "Bricolage Grotesque", sans-serif'; ctx.fillText(them.slice(0, 64), 48, H - 34); }
}
function wrap(ctx, text, x, y, max, lh) {
  let lineText = '';
  for (const word of String(text).split(' ')) {
    const test = lineText ? `${lineText} ${word}` : word;
    if (ctx.measureText(test).width > max && lineText) { ctx.fillText(lineText, x, y); y += lh; lineText = word; } else lineText = test;
  }
  if (lineText) { ctx.fillText(lineText, x, y); y += lh; }
  return y;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

export async function enterXR({ view, onTalking, onEnd }) {
  const mode = await navigator.xr.isSessionSupported('immersive-ar') ? 'immersive-ar' : 'immersive-vr';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local');
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none';
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
  if (mode === 'immersive-vr') { scene.background = new THREE.Color(0x0b0712); scene.add(new THREE.GridHelper(20, 40, 0x2a2238, 0x1a1424)); }

  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  scene.add(panel);
  draw(ctx, view); texture.needsUpdate = true;

  const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor'] });
  await renderer.xr.setSession(session);
  session.addEventListener('selectstart', () => onTalking(true));
  session.addEventListener('selectend', () => onTalking(false));

  // Lazy follow: the panel eases toward a point 1.1 m ahead and 15 cm below eye level.
  const target = new THREE.Vector3(), dir = new THREE.Vector3(), head = new THREE.Vector3();
  let placed = false;
  renderer.setAnimationLoop(() => {
    const cam = renderer.xr.getCamera();
    cam.getWorldPosition(head); cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
    target.copy(head).addScaledVector(dir, 1.1); target.y = head.y - 0.15;
    if (!placed) { panel.position.copy(target); placed = true; } else panel.position.lerp(target, 0.04);
    panel.lookAt(head.x, panel.position.y, head.z);
    renderer.render(scene, camera);
  });
  const cleanup = () => { renderer.setAnimationLoop(null); renderer.domElement.remove(); renderer.dispose(); onEnd?.(); };
  session.addEventListener('end', cleanup);
  return {
    update(v) { draw(ctx, v); texture.needsUpdate = true; },
    end() { session.end().catch(() => {}); }
  };
}
