import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import { env } from '$env/dynamic/private';
import path from 'path';
import { isGuid, writeJsonAtomic } from '$helpers/filehelper';

const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const trashFilename = path.join(thumbsDir, env.TRASH_FILE || 'trash.json');

//POST /api/trash/<guid>
export const POST: RequestHandler = async ({ params }) => {
    try {
        const guid = params.guid;
        if (!isGuid(guid)) return new Response('Invalid guid', { status: 400 });

        // Read existing trash file and toggle guid
        let trash: Array<string> = [];
        const fileExists = await fs.stat(trashFilename).then(() => true).catch(() => false);
        if (fileExists) {
            try {
                const trashRaw = await fs.readFile(trashFilename, 'utf-8');
                const parsed = JSON.parse(trashRaw);
                if (Array.isArray(parsed)) trash = parsed;
            } catch {
                // A corrupt trash file should not make toggling impossible.
                trash = [];
            }
        }
        // Add trash item if not exists
        if (!trash.find(trashItem => trashItem === guid)) {
            console.log("Adding to trash for GUID:", guid);
            trash.push(guid);
        }
        // Remove trash item if exists
        else {
            console.log("Removing from trash for GUID:", guid);
            trash = trash.filter(trashItem => trashItem !== guid);
        }
        await writeJsonAtomic(trashFilename, trash);
        return new Response('OK', { status: 200 });
    } catch (err) {
        console.error('Error saving trash file', err);
        return new Response('Error saving trash file', { status: 500 });
    }
}
