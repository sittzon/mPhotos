import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { env } from '$env/dynamic/private';
import { memoryCache } from '$helpers/memorycache';
import { photosMetaCacheKey, photosVersionKey, writeJsonAtomic, withIngestionLock, normalizeLivePhotoLinks } from '$helpers/filehelper';
import { getHashString, getImageDimensions, getVideoDimensions, getVideoDuration, getDateTakenFromPath } from '$helpers/imagehelper';
import { generateMedia, waitForMediaGeneration } from '$lib/server/media';
import fs from 'fs/promises';
import path from 'path';
import type { PhotoServerModel } from '$api';

const originalsDir = env.ORIGINAL_PHOTOS || '/originals';
const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const metaDataFilename = path.join(thumbsDir, env.METADATA_FILE || 'metadata.json');
const errorLogFilename = path.join(thumbsDir, env.ERRORS_FILE || 'errors.log');
const videoExts = ['.mp4', '.mov'];
const imageExts = ['.jpg', '.jpeg', '.heic', '.heif', '.png'];

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let pendingEvents: Map<string, 'add' | 'unlink' | 'change'> = new Map();
let isProcessingEvents = false;

function buildThumbnailPath(guid: string): { thumb: string; medium: string; loop: string; dir: string } {
    const sub1 = guid.substring(0, 2);
    const sub2 = guid.substring(2, 4);
    const dir = path.join(thumbsDir, sub1, sub2);
    return {
        dir,
        thumb: path.join(dir, guid + '.webp'),
        medium: path.join(dir, guid + '-medium.webp'),
        loop: path.join(dir, guid + '-loop.mp4')
    };
}

async function cleanupThumbnails(guid: string) {
    const { dir, thumb, medium, loop } = buildThumbnailPath(guid);
    await fs.unlink(thumb).catch(() => { });
    await fs.unlink(medium).catch(() => { });
    await fs.unlink(loop).catch(() => { });
    // Legacy name written by older versions of the watcher.
    await fs.unlink(path.join(dir, guid + '_loop.mp4')).catch(() => { });
}

// Find the still image that belongs to a Live Photo video (same path, different
// extension). Case-insensitive because cameras are inconsistent with extensions.
function findLivePhotoCompanion(videoPath: string, photos: PhotoServerModel[]): PhotoServerModel | undefined {
    const dot = videoPath.lastIndexOf('.');
    if (dot <= 0) return undefined;
    const base = videoPath.substring(0, dot).toLowerCase();
    return photos.find(photo => {
        if (photo.type !== 'photo') return false;
        const photoDot = photo.location.lastIndexOf('.');
        return photoDot > 0 && photo.location.substring(0, photoDot).toLowerCase() === base;
    });
}

function isValidFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return imageExts.includes(ext) || videoExts.includes(ext);
}

async function indexSingleFile(filePath: string, existingPhotos: PhotoServerModel[]): Promise<PhotoServerModel | null> {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const stat = await fs.stat(filePath);
    const isVideo = videoExts.includes(ext);

    let width = 0;
    let height = 0;
    let dateTaken = 'unknown';
    let type: PhotoServerModel['type'] = 'photo';
    let lengthSeconds: number | null = null;
    let referenceGuid: string | null = null;

    if (isVideo) {
        [width, height] = await getVideoDimensions(filePath);
        lengthSeconds = await getVideoDuration(filePath);

        const referencePhoto = findLivePhotoCompanion(filePath, existingPhotos);
        if (referencePhoto) {
            dateTaken = referencePhoto.dateTaken;
            type = 'live-photo-video';
            referenceGuid = referencePhoto.guid;
        } else {
            dateTaken = await getDateTakenFromPath(filePath) as string;
            type = lengthSeconds < 4 ? 'short-video' : 'video';
        }
    } else {
        [width, height] = await getImageDimensions(filePath, ext);
        dateTaken = await getDateTakenFromPath(filePath) as string;
    }

    return {
        // Hash the path, matching the initial indexer. Hashing content gave the same
        // guid to duplicate files and changed a file's identity on every edit.
        guid: getHashString(filePath),
        location: filePath,
        name: name,
        dateTaken: dateTaken,
        type: type,
        width: width,
        height: height,
        lengthSeconds: lengthSeconds,
        sizeKb: Math.floor(stat.size / 1024),
        isFavorite: false,
        isTrash: false,
        sidecarGuid: null,
        referenceGuid: referenceGuid
    };
}

async function processPendingEvents() {
    if (isProcessingEvents) return;
    isProcessingEvents = true;

    // Media jobs are collected while the metadata lock is held and executed after
    // it is released. ffmpeg/sharp can take seconds per file; holding the ingestion
    // lock for that long would stall the initial indexer (and therefore first load).
    const mediaJobs: Array<{ photo: PhotoServerModel; force: boolean }> = [];

    try {
        // Serialize with the initial indexer. Without this, the watcher could read
        // a partially built metadata array and write it back over the indexer.
        await withIngestionLock(async () => {
            const events = new Map(pendingEvents);
            pendingEvents.clear();
            if (events.size === 0) return;

            let photoMetadata: PhotoServerModel[] = Array.isArray(memoryCache[photosMetaCacheKey])
                ? [...(memoryCache[photosMetaCacheKey] as PhotoServerModel[])]
                : [];

            if (photoMetadata.length === 0) {
                try {
                    const metaRaw = await fs.readFile(metaDataFilename, 'utf-8');
                    const parsed = JSON.parse(metaRaw);
                    if (Array.isArray(parsed)) photoMetadata = parsed;
                } catch {
                    console.log('No existing metadata to sync with');
                }
            }

            normalizeLivePhotoLinks(photoMetadata);

            for (const [filePath, eventType] of events) {
                if (!isValidFile(filePath)) continue;

                try {
                    if (eventType === 'add' || eventType === 'change') {
                        const exists = await fs.stat(filePath).then(() => true).catch(() => false);
                        if (!exists) continue;

                        console.log(`File ${eventType}: ${filePath}`);

                        const existingIndex = photoMetadata.findIndex(p => p.location === filePath);
                        let wasIndexed = false;
                        if (existingIndex !== -1) {
                            const existing = photoMetadata[existingIndex];
                            wasIndexed = true;
                            // Let any in-flight repair finish using the old guid, then
                            // remove its outputs before regenerating from the new file.
                            await waitForMediaGeneration(existing.guid);
                            await cleanupThumbnails(existing.guid);
                            photoMetadata.splice(existingIndex, 1);
                        }

                        const photoMeta = await indexSingleFile(filePath, photoMetadata);
                        if (!photoMeta) continue;

                        photoMetadata.push(photoMeta);
                        mediaJobs.push({ photo: photoMeta, force: wasIndexed });

                        // If a still image was added after its Live Photo video, promote
                        // the already-indexed short video now instead of on next restart.
                        if (!videoExts.includes(path.extname(filePath).toLowerCase())) {
                            const videoCompanion = findVideoCompanion(filePath, photoMetadata);
                            if (videoCompanion) {
                                videoCompanion.type = 'live-photo-video';
                                videoCompanion.referenceGuid = photoMeta.guid;
                                videoCompanion.dateTaken = photoMeta.dateTaken;
                                mediaJobs.push({ photo: videoCompanion, force: false });
                            }
                        }
                    }
                    else if (eventType === 'unlink') {
                        console.log(`File deleted: ${filePath}`);

                        const existingIndex = photoMetadata.findIndex(p => p.location === filePath);
                        if (existingIndex !== -1) {
                            const removed = photoMetadata[existingIndex];
                            await waitForMediaGeneration(removed.guid);
                            await cleanupThumbnails(removed.guid);
                            photoMetadata.splice(existingIndex, 1);

                            // Clear links pointing at the removed entry. If a still was
                            // deleted, its video becomes a standalone clip and needs a poster.
                            for (const photo of photoMetadata) {
                                if (photo.referenceGuid === removed.guid) {
                                    photo.referenceGuid = null;
                                    if (photo.type === 'live-photo-video') {
                                        photo.type = photo.lengthSeconds != null && photo.lengthSeconds < 4
                                            ? 'short-video'
                                            : 'video';
                                        mediaJobs.push({ photo, force: false });
                                    }
                                }
                                if (photo.sidecarGuid === removed.guid) {
                                    photo.sidecarGuid = null;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error processing ${eventType} for ${filePath}:`, e);
                    const now = new Date().toISOString();
                    await fs.appendFile(errorLogFilename, `[${now}] Watcher error: ${filePath}. Exception: ${e}\n`);
                }
            }

            normalizeLivePhotoLinks(photoMetadata);
            photoMetadata.sort((a, b) => a.dateTaken.localeCompare(b.dateTaken));

            await writeJsonAtomic(metaDataFilename, photoMetadata);
            memoryCache[photosMetaCacheKey] = photoMetadata;
            memoryCache[photosVersionKey] = (memoryCache[photosVersionKey] || 0) + 1;
            console.log('Metadata updated from file watcher');
        });

        // Generate/replace media after the metadata lock has been released.
        for (const job of mediaJobs) {
            try {
                await generateMedia(job.photo, { force: job.force });
            } catch (e) {
                console.error(`Error generating media for ${job.photo.location}:`, e);
                const now = new Date().toISOString();
                await fs.appendFile(errorLogFilename, `[${now}] Watcher media error: ${job.photo.location}. Exception: ${e}\n`).catch(() => { });
            }
        }
    } catch (e) {
        // Previously an unhandled rejection here would take down the process.
        console.error('Error processing file watcher batch:', e);
        const now = new Date().toISOString();
        await fs.appendFile(errorLogFilename, `[${now}] Watcher batch error. Exception: ${e}\n`).catch(() => { });
    } finally {
        isProcessingEvents = false;
        // Events that arrived while this batch was waiting for the lock (or while
        // it was running) need another pass.
        if (pendingEvents.size > 0) scheduleSync();
    }
}

function findVideoCompanion(photoPath: string, photos: PhotoServerModel[]): PhotoServerModel | undefined {
    const dot = photoPath.lastIndexOf('.');
    if (dot <= 0) return undefined;
    const base = photoPath.substring(0, dot).toLowerCase();
    return photos.find(photo => {
        if (!videoExts.includes(path.extname(photo.location).toLowerCase())) return false;
        const photoDot = photo.location.lastIndexOf('.');
        if (photoDot <= 0 || photo.location.substring(0, photoDot).toLowerCase() !== base) return false;
        return photo.lengthSeconds != null && photo.lengthSeconds < 6;
    });
}


function scheduleSync() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(processPendingEvents, 500);
}

export async function startFileWatcher() {
    if (watcher) {
        await watcher.close();
    }

    console.log(`Starting file watcher on: ${originalsDir}`);
    
    watcher = chokidar.watch(originalsDir, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });

    watcher.on('add', (filePath) => {
        if (isValidFile(filePath)) {
            pendingEvents.set(filePath, 'add');
            scheduleSync();
        }
    });

    watcher.on('unlink', (filePath) => {
        if (isValidFile(filePath)) {
            pendingEvents.set(filePath, 'unlink');
            scheduleSync();
        }
    });

    watcher.on('change', (filePath) => {
        if (isValidFile(filePath)) {
            pendingEvents.set(filePath, 'change');
            scheduleSync();
        }
    });

    watcher.on('error', (error) => {
        console.error('File watcher error:', error);
    });

    console.log('File watcher started');
}

export async function stopFileWatcher() {
    if (watcher) {
        await watcher.close();
        watcher = null;
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
}