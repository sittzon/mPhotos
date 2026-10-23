import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private'
import { getStatEtag, isNotModified, mediaCacheHeaders, MEDIA_CACHE_CONTROL } from '$helpers/cachehelper';
import { isGuid } from '$helpers/filehelper';

const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';

export const GET: RequestHandler = async ({ request, params }) => {
    const guid = params.guid;
    if (!isGuid(guid)) return new Response('Not found', { status: 404 });
    const fileName = path.join(thumbsDir, guid.substring(0, 2), guid.substring(2, 4), guid + '-medium.webp');
    const stat = await fs.stat(fileName).catch(() => null);
    if (!stat) return new Response('Not found', { status: 404 });
    const etag = getStatEtag(stat);
    if (isNotModified(request.headers.get('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': MEDIA_CACHE_CONTROL } });
    }
    const b = await fs.readFile(fileName);
    return new Response(new Uint8Array(b), { status: 200, headers: mediaCacheHeaders('image/webp', etag) });
};
