import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';
import { generateThumbnailBytes, generateVideoThumbnail, generateVideoLoopClip } from '$helpers/imagehelper';
import type { PhotoServerModel } from '$api';

const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const errorLogFilename = path.join(thumbsDir, env.ERRORS_FILE || 'errors.log');
const thumbnailSizeWidth = Number(env.THUMBNAIL_SIZE) || 300;
const mediumSizeWidth = Number(env.MEDIUM_SIZE) || 1200;
const videoExts = ['.mp4', '.mov'];

// Four concurrent sharp/ffmpeg jobs is enough to repair a library quickly without
// spawning hundreds of processes (and exhausting memory) on a large collection.
const REPAIR_CONCURRENCY = 4;

const exists = (filename: string): Promise<boolean> =>
    fs.stat(filename).then(() => true).catch(() => false);

const buildMediaDir = (guid: string): string =>
    path.join(thumbsDir, guid.substring(0, 2), guid.substring(2, 4));

async function generateMediaNow(photoMeta: PhotoServerModel, force: boolean): Promise<void> {
    if (!photoMeta.width || !photoMeta.height) {
        throw new Error(`Cannot generate media without dimensions: ${photoMeta.location}`);
    }

    const ext = path.extname(photoMeta.location).toLowerCase();
    const isVideo = videoExts.includes(ext);
    const isHeic = ext === '.heic' || ext === '.heif';
    const dir = buildMediaDir(photoMeta.guid);
    await fs.mkdir(dir, { recursive: true });

    const isLiveVideo = photoMeta.type === 'live-photo-video';
    // A linked Live Photo video uses the still image as its poster, so it only
    // needs the loop clip. Unlinked live videos still need their own poster.
    const needsPoster = !isLiveVideo || !photoMeta.referenceGuid;

    if (needsPoster) {
        const thumbPath = path.join(dir, photoMeta.guid + '.webp');
        if (force || !(await exists(thumbPath))) {
            const w = thumbnailSizeWidth;
            const h = Math.floor(photoMeta.height * (w / photoMeta.width));
            if (isVideo) {
                await generateVideoThumbnail(photoMeta.location, thumbPath, w, h);
            } else {
                await generateThumbnailBytes(photoMeta.location, w, h, thumbPath, 80, isHeic);
            }
        }

        const mediumPath = path.join(dir, photoMeta.guid + '-medium.webp');
        if (force || !(await exists(mediumPath))) {
            const w = Math.min(photoMeta.width, mediumSizeWidth);
            const h = Math.floor(photoMeta.height * (w / photoMeta.width));
            if (isVideo) {
                await generateVideoThumbnail(photoMeta.location, mediumPath, w, h, 1);
            } else {
                await generateThumbnailBytes(photoMeta.location, w, h, mediumPath, 99, isHeic);
            }
        }
    }

    if (isLiveVideo) {
        const loopPath = path.join(dir, photoMeta.guid + '-loop.mp4');
        if (force || !(await exists(loopPath))) {
            await generateVideoLoopClip(photoMeta.location, loopPath);
        }
    }
}

// Per-GUID chain so the watcher and the startup repair pass can never run two
// ffmpeg/sharp jobs writing the same output files at the same time.
const mediaLocks = new Map<string, Promise<void>>();

export function generateMedia(photoMeta: PhotoServerModel, options: { force?: boolean } = {}): Promise<void> {
    const force = options.force ?? false;
    const previous = mediaLocks.get(photoMeta.guid) ?? Promise.resolve();
    const promise = previous
        .catch(() => { })
        .then(() => generateMediaNow(photoMeta, force))
        .finally(() => {
            if (mediaLocks.get(photoMeta.guid) === promise) {
                mediaLocks.delete(photoMeta.guid);
            }
        });
    mediaLocks.set(photoMeta.guid, promise);
    return promise;
}

// Wait for an in-flight generation before deleting/replacing its output files.
export async function waitForMediaGeneration(guid: string): Promise<void> {
    await mediaLocks.get(guid)?.catch(() => { });
}

// Bounded background queue used to fill in thumbnails/medium images/loop clips
// that are missing for already-indexed photos (crashed first scan, cleared cache,
// changed size settings, etc.).
const repairQueue: PhotoServerModel[] = [];
const queuedGuids = new Set<string>();
let activeRepairs = 0;

function drainRepairQueue(): void {
    while (activeRepairs < REPAIR_CONCURRENCY && repairQueue.length > 0) {
        const photoMeta = repairQueue.shift() as PhotoServerModel;
        queuedGuids.delete(photoMeta.guid);
        activeRepairs++;

        generateMedia(photoMeta)
            .catch(async (e) => {
                const now = new Date().toISOString();
                console.error(`Error generating missing media for ${photoMeta.location}:`, e);
                await fs.appendFile(errorLogFilename, `[${now}] Error generating media: ${photoMeta.location}. Exception: ${e}\n`).catch(() => { });
            })
            .finally(() => {
                activeRepairs--;
                drainRepairQueue();
            });
    }
}

// Queue media (re)generation for the given photos. Existing files are skipped,
// so this is safe to call on every startup.
export function scheduleMediaRepair(photos: PhotoServerModel[]): void {
    for (const photo of photos) {
        if (queuedGuids.has(photo.guid)) continue;
        queuedGuids.add(photo.guid);
        repairQueue.push(photo);
    }
    drainRepairQueue();
}
