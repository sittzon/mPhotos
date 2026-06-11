import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { env } from '$env/dynamic/private';

const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';

export const GET: RequestHandler = async ({ request, params }) => {
    const guid = params.guid as string;
    const sub1 = guid.substring(0, 2);
    const sub2 = guid.substring(2, 4);
    const location = path.join(thumbsDir, sub1, sub2, guid + '-loop.mp4');

    const exists = fs.existsSync(location);
    if (!exists) return new Response('Not found', { status: 404 });

    const stat = fs.statSync(location);
    const fileSize = stat.size;
    const range = request.headers.get('range');
    const mimeType = 'video/mp4';

    function nodeStreamToWeb(stream: fs.ReadStream) {
        return new ReadableStream({
            start(controller) {
                stream.on('data', chunk => controller.enqueue(chunk));
                stream.on('end', () => controller.close());
                stream.on('error', err => controller.error(err));
            },
            cancel() {
                stream.destroy();
            }
        });
    }

    if (!range) {
        const fileStream = fs.createReadStream(location);
        return new Response(nodeStreamToWeb(fileStream), {
            status: 200,
            headers: {
                'Content-Length': fileSize.toString(),
                'Content-Type': mimeType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });
    }

    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const fileStream = fs.createReadStream(location, { start, end });

    return new Response(nodeStreamToWeb(fileStream), {
        status: 206,
        headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000, immutable'
        }
    });
};
