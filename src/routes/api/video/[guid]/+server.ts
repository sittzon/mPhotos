import type { RequestHandler } from '@sveltejs/kit';
import { guidToLocation } from '$helpers/filehelper';
import { getStatEtag, isNotModified, MEDIA_CACHE_CONTROL } from '$helpers/cachehelper';
import { parseRangeHeader } from '$helpers/rangehelper';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const videoExts = ['.mp4', '.mov'];

// Readable.toWeb() is a pull-based adapter: it only reads more of the file when
// the client actually consumes the response. The previous manual ReadableStream
// enqueued every 'data' event immediately and buffered the whole file in memory
// for slow clients.
function streamResponse(stream: fs.ReadStream, status: number, headers: Record<string, string>): Response {
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
        status,
        headers
    });
}

export const GET: RequestHandler = async ({ request, params }) => {
    const guid = params.guid as string;
    const location = guidToLocation(guid);
    if (!location) return new Response('Not found', { status: 404 });

    // Confirm that file is video
    const ext = path.extname(location).toLowerCase();
    if (!videoExts.includes(ext)) return new Response('File is not of type video', { status: 404 });

    const stat = await fs.promises.stat(location).catch(() => null);
    if (!stat) return new Response('Not found', { status: 404 });

    const fileSize = stat.size;
    const etag = getStatEtag(stat);
    const mimeType = ext === '.mp4' ? 'video/mp4' : 'video/quicktime';
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

    if (range.type === 'none') {
        if (isNotModified(request.headers.get('if-none-match'), etag)) {
            return new Response(null, {
                status: 304,
                headers: { 'ETag': etag, 'Cache-Control': MEDIA_CACHE_CONTROL }
            });
        }

        console.log('Serving full video:', location);
        return streamResponse(fs.createReadStream(location), 200, {
            'Content-Length': fileSize.toString(),
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'ETag': etag,
            'Cache-Control': MEDIA_CACHE_CONTROL
        });
    }

    const { start, end } = range;
    const chunksize = end - start + 1;
    console.log('Streaming video:', guid, `bytes ${start}-${end}/${fileSize}`);

    return streamResponse(fs.createReadStream(location, { start, end }), 206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': mimeType,
        'ETag': etag,
        'Cache-Control': MEDIA_CACHE_CONTROL
    });
};
