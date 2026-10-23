import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import type { PhotoServerModel } from '$api';
import { memoryCache } from '$helpers/memorycache';
import type { FileInfo } from '../models/FileInfo';

export const photosMetaCacheKey = 'photosMeta';
// Bumped whenever the photo metadata content changes (used to invalidate derived caches)
export const photosVersionKey = 'photosMetaVersion';
// Set once the library has been fully reconciled against the originals folder.
// The watcher may populate photosMetaCacheKey earlier, so its presence alone must
// not be mistaken for a completed initial scan.
export const photosLoadedKey = 'photosLoaded';

// Serialize every operation that mutates the photo metadata / metadata.json.
// The initial indexer and the file watcher both own this state; without a shared
// lock the watcher can read a half-built array and write it over the indexer's work.
let ingestionQueue: Promise<unknown> = Promise.resolve();

export function withIngestionLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = ingestionQueue.then(operation, operation);
    // Keep the queue usable even if an operation rejects.
    ingestionQueue = result.then(() => undefined, () => undefined);
    return result;
}

// Write JSON through a temporary file + rename so a crash or a concurrent reader
// can never observe a half-written metadata/favorites/trash file.
export async function writeJsonAtomic(filename: string, data: unknown): Promise<void> {
    const tempFilename = `${filename}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tempFilename, JSON.stringify(data));
    try {
        await fs.rename(tempFilename, filename);
    } catch (e) {
        await fs.unlink(tempFilename).catch(() => { });
        throw e;
    }
}

// Rebuild Live Photo links from the actual files instead of trusting whatever was
// persisted. This repairs metadata written by older versions of the watcher and
// makes link handling case-insensitive (e.g. IMG_0001.JPG + IMG_0001.MOV).
export function normalizeLivePhotoLinks(photos: PhotoServerModel[]): void {
    const findPhotoCompanion = (video: PhotoServerModel): PhotoServerModel | undefined => {
        const dot = video.location.lastIndexOf('.');
        if (dot <= 0) return undefined;
        const base = video.location.substring(0, dot).toLowerCase();
        return photos.find(photo => {
            if (photo.type !== 'photo') return false;
            const photoDot = photo.location.lastIndexOf('.');
            return photoDot > 0 && photo.location.substring(0, photoDot).toLowerCase() === base;
        });
    };

    for (const photo of photos) {
        photo.dateTaken = typeof photo.dateTaken === 'string' ? photo.dateTaken : 'unknown';
        photo.isFavorite = photo.isFavorite ?? false;
        photo.isTrash = photo.isTrash ?? false;
        photo.sidecarGuid = null;
        if (photo.type !== 'live-photo-video') {
            photo.referenceGuid = null;
        }
    }

    for (const video of photos) {
        if (video.type === 'photo') continue;

        // Videos shorter than 6s are candidates for Live Photo companions, matching
        // the initial indexer. Already-classified live videos are always re-checked.
        const isCandidate = video.type === 'live-photo-video'
            || (video.lengthSeconds != null && video.lengthSeconds < 6);
        if (!isCandidate) continue;

        const companion = findPhotoCompanion(video);
        if (companion) {
            video.type = 'live-photo-video';
            video.referenceGuid = companion.guid;
            video.dateTaken = companion.dateTaken;
            if (!companion.sidecarGuid) {
                companion.sidecarGuid = video.guid;
            }
        } else if (video.type === 'live-photo-video') {
            // A short clip without a still is just a normal (short) video.
            video.referenceGuid = null;
            video.type = video.lengthSeconds != null && video.lengthSeconds < 4
                ? 'short-video'
                : 'video';
        }
    }
}

// GUIDs are SHA-256 hex strings. Validate before using one in a filesystem path.
export const isGuid = (value: string | undefined | null): value is string =>
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

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