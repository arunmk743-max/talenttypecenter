import { isSameOriginRequest } from '../../lib/request-origin.js';
import { getAccount } from '../../lib/session.js';
import { getStore, getDeployStore } from '@netlify/blobs';
import { isAdmin } from '../../lib/validation.js';
import type { Config, Context } from '@netlify/functions';
export default async (req: Request, context: Context) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const store = context.deploy.context === 'production' ? getStore({ name: 'institute-assets', consistency: 'strong' }) : getDeployStore({ consistency: 'strong' });
    if (req.method === 'GET') {
      const logo = await store.getWithMetadata('logo', { type: 'arrayBuffer' });
      if (!logo) return new Response('No custom logo', { status: 404, headers });
      return new Response(logo.data, { headers: { ...headers, 'Content-Type': String(logo.metadata.contentType || 'image/png') } });
    }
    if (!['PUT', 'DELETE'].includes(req.method)) return new Response('Method not allowed', { status: 405 });
    if (!isSameOriginRequest(req) || !isAdmin(await getAccount(req))) return new Response('Administrator access required', { status: 403, headers });
    if (req.method === 'DELETE') await store.delete('logo');
    else {
      const type = req.headers.get('content-type') || '';
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) return new Response('Choose a PNG, JPEG, WebP, or GIF image.', { status: 400, headers });
      const image = await req.arrayBuffer();
      if (image.byteLength > 2_000_000) return new Response('Choose an image smaller than 2 MB.', { status: 413, headers });
      const bytes = new Uint8Array(image);
      const valid = type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : type === 'image/gif' ? Buffer.from(bytes.slice(0, 6)).toString().match(/^GIF8[79]a$/) : Buffer.from(bytes.slice(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.slice(8, 12)).toString() === 'WEBP';
      if (!valid) return new Response('Invalid image file.', { status: 400, headers });
      await store.set('logo', image, { metadata: { contentType: type } });
    }
    return Response.json({ saved: true }, { headers });
  } catch { return Response.json({ error: 'Logo could not be saved. Please try again.' }, { status: 503, headers }); }
};
export const config: Config = { path: '/api/logo' };
