import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { guidToLocation } from '$helpers/filehelper';
import { getStatEtag, isNotModified, mediaCacheHeaders, MEDIA_CACHE_CONTROL } from '$helpers/cachehelper';

const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
};

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
        const contentType = contentTypes[path.extname(location).toLowerCase()] || 'application/octet-stream';
        // Stream the original instead of buffering it: full-resolution files can be
        // tens of megabytes and several concurrent viewers would otherwise pile up.
        const body = Readable.toWeb(createReadStream(location)) as unknown as ReadableStream<Uint8Array>;
        return new Response(body, {
            status: 200,
            headers: {
                ...mediaCacheHeaders(contentType, etag),
                'Content-Length': stat.size.toString()
            }
        });
    } catch {
        return new Response('Not found', { status: 404 });
    }
};
