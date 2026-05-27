import path from 'path';
import fs from 'fs/promises';
import type { PhotoServerModel } from '$api';
import { memoryCache } from '$helpers/memorycache';
import type { FileInfo } from '../models/fileInfo';

export const photosMetaCacheKey = 'photosMeta';

// Map GUID to original file location
export function guidToLocation(guid: string): string | null {
    const photos: PhotoServerModel[] = memoryCache[photosMetaCacheKey] || [];
    // console.log(photos.find(x => x.guid === guid));
    return photos.find(x => x.guid === guid)?.location ?? null;
}

// Recursively get all files in the directory
export async function getFileInfosRecursively(root: string): Promise<Array<FileInfo>> {
    const results: Array<FileInfo> = [];
    console.log(`Scanning directory: ${root}`);
    async function walk(dir: string) {
        const files = await fs.readdir(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                await walk(fullPath);
            } else {
                const ext = path.extname(file.name).toLowerCase();
                const stat = await fs.stat(fullPath);
                results.push({
                    fullName: fullPath,
                    name: file.name,
                    extension: ext,
                    length: stat.size
                });
            }
        }
    }
    await walk(root);
    return results;
}