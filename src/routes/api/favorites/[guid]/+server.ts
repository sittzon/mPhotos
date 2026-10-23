import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import { env } from '$env/dynamic/private';
import path from 'path';
import { isGuid, writeJsonAtomic } from '$helpers/filehelper';

const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const favoritesFilename = path.join(thumbsDir, env.FAVORITES_FILE || 'favorites.json');

//POST /api/favorites/<guid>
export const POST: RequestHandler = async ({ params }) => {
    try {
        const guid = params.guid;
        if (!isGuid(guid)) return new Response('Invalid guid', { status: 400 });

        // Read existing favorites file and toggle guid
        let favorites: Array<string> = [];
        const fileExists = await fs.stat(favoritesFilename).then(() => true).catch(() => false);
        if (fileExists) {
            try {
                const favRaw = await fs.readFile(favoritesFilename, 'utf-8');
                const parsed = JSON.parse(favRaw);
                if (Array.isArray(parsed)) favorites = parsed;
            } catch {
                // A corrupt favorites file should not make toggling impossible.
                favorites = [];
            }
        }
        // Add favorite if not exists
        if (!favorites.find(fav => fav === guid)) {
            console.log("Adding favorite for GUID:", guid);
            favorites.push(guid);
        }
        // Remove favorite if exists
        else {
            console.log("Removing favorite for GUID:", guid);
            favorites = favorites.filter(fav => fav !== guid);
        }
        await writeJsonAtomic(favoritesFilename, favorites);
        return new Response('OK', { status: 200 });
    } catch (err) {
        console.error('Error saving favorites', err);
        return new Response('Error saving favorites', { status: 500 });
    }
}
