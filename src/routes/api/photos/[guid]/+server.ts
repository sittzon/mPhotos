import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import { guidToLocation } from '$helpers/filehelper';
import { getStatEtag, isNotModified, mediaCacheHeaders, MEDIA_CACHE_CONTROL } from '$helpers/cachehelper';

export const GET: RequestHandler = async ({ request, params }) => {
    const guid = params.guid as string;
    const location = guidToLocation(guid);
    if (!location) return new Response('Not found', { status: 404 });
    try {
        const stat = await fs.stat(location).catch(() => null);
        if (!stat) return new Response('Not found', { status: 404 });
        const etag = getStatEtag(stat);
        if (isNotModified(request.headers.get('if-none-match'), etag)) {
            return new Response(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': MEDIA_CACHE_CONTROL } });
        }
        const b = await fs.readFile(location);
        // console.log(`Serving photo ${guid} from location ${location}, size: ${b.length}`);
        return new Response(new Uint8Array(b), { status: 200, headers: mediaCacheHeaders('image/jpeg', etag) });
    } catch {
        return new Response('Not found', { status: 404 });
    }
};
