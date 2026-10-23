import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { env } from '$env/dynamic/private';
import { Readable } from 'stream';
import { getStatEtag, isNotModified, MEDIA_CACHE_CONTROL } from '$helpers/cachehelper';
import { isGuid } from '$helpers/filehelper';
import { parseRangeHeader } from '$helpers/rangehelper';

const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';

function streamResponse(stream: fs.ReadStream, status: number, headers: Record<string, string>): Response {
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
        status,
        headers
    });
}

export const GET: RequestHandler = async ({ request, params }) => {
    const guid = params.guid;
    if (!isGuid(guid)) return new Response('Not found', { status: 404 });

    const sub1 = guid.substring(0, 2);
    const sub2 = guid.substring(2, 4);
    const location = path.join(thumbsDir, sub1, sub2, guid + '-loop.mp4');

    const stat = await fs.promises.stat(location).catch(() => null);
    if (!stat) return new Response('Not found', { status: 404 });

    const fileSize = stat.size;
    const etag = getStatEtag(stat);
    const range = parseRangeHeader(request.headers.get('range'), fileSize);

    if (range.type === 'invalid') {
        return new Response('Invalid range', { status: 400 });
    }
    if (range.type === 'unsatisfiable') {
        return new Response(null, {
            status: 416,
            headers: {
                'Content-Range': `bytes */${fileSize}`,
                'Accept-Ranges': 'bytes'
            }
        });
    }

    // Loop clips are regenerated in place when the source changes, so they must
    // revalidate rather than be served as immutable.
    if (range.type === 'none') {
        if (isNotModified(request.headers.get('if-none-match'), etag)) {
            return new Response(null, {
                status: 304,
                headers: { 'ETag': etag, 'Cache-Control': MEDIA_CACHE_CONTROL }
            });
        }

        return streamResponse(fs.createReadStream(location), 200, {
            'Content-Length': fileSize.toString(),
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'ETag': etag,
            'Cache-Control': MEDIA_CACHE_CONTROL
        });
    }

    const { start, end } = range;
    return streamResponse(fs.createReadStream(location, { start, end }), 206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': (end - start + 1).toString(),
        'Content-Type': 'video/mp4',
        'ETag': etag,
        'Cache-Control': MEDIA_CACHE_CONTROL
    });
};
