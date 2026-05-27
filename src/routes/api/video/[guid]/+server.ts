import type { RequestHandler } from '@sveltejs/kit';
import { guidToLocation } from '$helpers/filehelper';
import fs from 'fs';
import path from 'path';

const videoExts = ['.mp4', '.mov'];

export const GET: RequestHandler = async ({ request, params }) => {
    const guid = params.guid as string;
    const location = guidToLocation(guid);
    if (!location) return new Response('Not found', { status: 404 });

    // Confirm that file is video
    const ext = path.extname(location).toLowerCase();
    const isVideo = videoExts.includes(ext);
    if (isVideo) {
        const stat = fs.statSync(location);
        const fileSize = stat.size;
        const range = request.headers.get('range');
        const mimeType = ext === '.mp4' ? 'video/mp4' : ext === '.mov' ? 'video/quicktime' : 'application/octet-stream';

        // Helper to convert Node.js stream to web ReadableStream
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
            // No range header: send the entire file
            console.log("Serving full video:", location);
            const fileStream = fs.createReadStream(location);
            return new Response(nodeStreamToWeb(fileStream), {
                status: 200,
                headers: {
                    'Content-Length': fileSize.toString(),
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                }
            });
        }

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;

        const fileStream = fs.createReadStream(location, { start, end });
        const headers = {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize.toString(),
            "Content-Type": mimeType,
        };

        console.log("Streaming video:", guid, `bytes ${start}-${end}/${fileSize}`);

        return new Response(nodeStreamToWeb(fileStream), { status: 206, headers });
    }

    return new Response('File is not of type video', { status: 404 });
};
