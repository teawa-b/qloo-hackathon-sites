// Turn a Hunyuan World result (layered PLY meshes, millions of triangles) into one small GLB a browser can walk:
// vertices are merged on a grid (vertex clustering), colours averaged, and every layer except the sky is kept.
//   node scripts/world-to-glb.js <unzipped world dir> <out.glb> [cells per axis, default 220]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out, cellsArg] = process.argv.slice(2);
const CELLS = Number(cellsArg || 220);

function readPly(file) {
  const buf = readFileSync(file);
  const headEnd = buf.indexOf('end_header') + 'end_header'.length + 1;
  const head = buf.slice(0, headEnd).toString('latin1').split('\n');
  const vCount = Number(head.find(l => l.startsWith('element vertex')).split(' ')[2]);
  const fCount = Number(head.find(l => l.startsWith('element face')).split(' ')[2]);
  const props = head.filter(l => l.startsWith('property ') && !l.includes('list')).map(l => l.split(' ').slice(1));
  const size = { double: 8, float: 4, uchar: 1, uint8: 1 };
  let stride = 0; const at = {};
  for (const [type, name] of props) { at[name] = { off: stride, type }; stride += size[type]; }
  const get = (o, p) => p.type === 'double' ? buf.readDoubleLE(o + p.off) : p.type === 'float' ? buf.readFloatLE(o + p.off) : buf[o + p.off];
  const pos = new Float32Array(vCount * 3), col = new Uint8Array(vCount * 3);
  for (let i = 0, o = headEnd; i < vCount; i++, o += stride) {
    pos[i * 3] = get(o, at.x); pos[i * 3 + 1] = get(o, at.y); pos[i * 3 + 2] = get(o, at.z);
    col[i * 3] = get(o, at.red); col[i * 3 + 1] = get(o, at.green); col[i * 3 + 2] = get(o, at.blue);
  }
  const faces = new Uint32Array(fCount * 3);
  for (let i = 0, o = headEnd + vCount * stride; i < fCount; i++) { const n = buf[o]; faces[i * 3] = buf.readUInt32LE(o + 1); faces[i * 3 + 1] = buf.readUInt32LE(o + 5); faces[i * 3 + 2] = buf.readUInt32LE(o + 9); o += 1 + n * 4; }
  return { pos, col, faces };
}

const layers = readdirSync(dir).filter(f => /^mesh_layer\d+\.ply$/.test(f)).sort();
// Every layer: foreground objects, the room shell, and the 'sky' dome (indoors, that is the ceiling).
const keep = layers;
const parts = keep.map(f => { const t = Date.now(); const p = readPly(join(dir, f)); console.log(f, p.pos.length / 3, 'vertices', p.faces.length / 3, 'faces', `${Date.now() - t} ms`); return p; });

// Bounds of everything, then one grid over it.
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const { pos } of parts) for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { if (pos[i + a] < min[a]) min[a] = pos[i + a]; if (pos[i + a] > max[a]) max[a] = pos[i + a]; }
const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]), cell = span / CELLS;
console.log('bounds', min.map(v => v.toFixed(2)), max.map(v => v.toFixed(2)), 'cell', cell.toFixed(3));

const ids = new Map();
const sums = []; // per cluster: x, y, z, r, g, b, n
const outFaces = [];
for (const { pos, col, faces } of parts) {
  const remap = new Int32Array(pos.length / 3);
  for (let i = 0; i < pos.length / 3; i++) {
    const ix = Math.floor((pos[i * 3] - min[0]) / cell), iy = Math.floor((pos[i * 3 + 1] - min[1]) / cell), iz = Math.floor((pos[i * 3 + 2] - min[2]) / cell);
    const key = (ix * (CELLS + 2) + iy) * (CELLS + 2) + iz;
    let id = ids.get(key);
    if (id === undefined) { id = sums.length / 7; ids.set(key, id); sums.push(0, 0, 0, 0, 0, 0, 0); }
    const s = id * 7;
    sums[s] += pos[i * 3]; sums[s + 1] += pos[i * 3 + 1]; sums[s + 2] += pos[i * 3 + 2];
    sums[s + 3] += col[i * 3]; sums[s + 4] += col[i * 3 + 1]; sums[s + 5] += col[i * 3 + 2]; sums[s + 6]++;
    remap[i] = id;
  }
  for (let f = 0; f < faces.length; f += 3) {
    const a = remap[faces[f]], b = remap[faces[f + 1]], c = remap[faces[f + 2]];
    if (a !== b && b !== c && a !== c) outFaces.push(a, b, c);
  }
}
const n = sums.length / 7;
const P = new Float32Array(n * 3), C = new Uint8Array(n * 4);
const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) {
  const s = i * 7, k = sums[s + 6];
  for (let a = 0; a < 3; a++) { P[i * 3 + a] = sums[s + a] / k; pmin[a] = Math.min(pmin[a], P[i * 3 + a]); pmax[a] = Math.max(pmax[a], P[i * 3 + a]); }
  C[i * 4] = sums[s + 3] / k; C[i * 4 + 1] = sums[s + 4] / k; C[i * 4 + 2] = sums[s + 5] / k; C[i * 4 + 3] = 255;
}
const I = Uint32Array.from(outFaces);
console.log('out', n, 'vertices', I.length / 3, 'faces');

// One GLB: positions, vertex colours, indices; an unlit material so the baked colours show as they are.
const pad4 = b => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]);
const bins = [Buffer.from(P.buffer), Buffer.from(C.buffer), Buffer.from(I.buffer)].map(pad4);
let offset = 0; const views = bins.map(b => { const v = { buffer: 0, byteOffset: offset, byteLength: b.length }; offset += b.length; return v; });
const gltf = {
  asset: { version: '2.0', generator: 'qloo-hackathon-sites world-to-glb' },
  extensionsUsed: ['KHR_materials_unlit'],
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }, extensions: { KHR_materials_unlit: {} }, doubleSided: true }],
  buffers: [{ byteLength: offset }],
  bufferViews: [{ ...views[0], target: 34962 }, { ...views[1], target: 34962 }, { ...views[2], target: 34963 }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: pmin, max: pmax },
    { bufferView: 1, componentType: 5121, normalized: true, count: n, type: 'VEC4' },
    { bufferView: 2, componentType: 5125, count: I.length, type: 'SCALAR' }
  ]
};
const json = pad4(Buffer.from(JSON.stringify(gltf).padEnd(Math.ceil(JSON.stringify(gltf).length / 4) * 4, ' ')));
const bin = Buffer.concat(bins);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4); return b; };
writeFileSync(out, Buffer.concat([header, ch(json.length, 'JSON'), json, ch(bin.length, 'BIN\0'), bin]));
console.log('wrote', out, `${(12 + 16 + json.length + bin.length) / 1e6} MB`);
