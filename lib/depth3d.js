import { fetchJson, UpstreamError } from './http.js';

// A painting lifted into a walkable 3D room: fal's MoGe-2 estimates the depth of every pixel from one image and
// returns a textured mesh (glTF, camera at the origin looking down -Z). It takes a few seconds and costs well under
// a cent. The mesh has one vertex per input pixel, so the browser sends a small copy of the painting (about
// 450 px wide) and puts the full painting back on the mesh itself.
export function createDepth3d({ key, fetcher = fetch }) {
  return {
    async build(dataUrl) {
      if (typeof dataUrl !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 500_000) {
        throw Object.assign(new Error('Send the painting as a small JPEG.'), { status: 400 });
      }
      const data = await fetchJson(fetcher, 'https://fal.run/fal-ai/moge-2', {
        method: 'POST', headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ image_url: dataUrl, edge_threshold: 0.03, export_ply: false })
      }, { label: 'fal MoGe-2', secrets: [key], timeout: 90000 });
      const url = data.model_mesh?.url;
      if (!/^https:\/\/[\w.-]+\.fal\.media\//.test(url || '')) throw new UpstreamError('fal MoGe-2 returned no mesh.');
      return { url, fovX: data.fov_x, fovY: data.fov_y };
    },
    // The mesh is streamed through this server so the page only ever talks to its own origin.
    async open(url) {
      const res = await fetcher(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new UpstreamError(`fal media returned HTTP ${res.status}.`);
      return res;
    }
  };
}
