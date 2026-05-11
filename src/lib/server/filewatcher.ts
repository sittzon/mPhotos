import chokidar, { FSWatcher } from 'chokidar';
import { env } from '$env/dynamic/private';
import { memoryCache } from '$helpers/memorycache';
import { photosMetaCacheKey } from '$helpers/filehelper';
import { getFileContentHash, generateThumbnailBytes, generateVideoThumbnail, getImageDimensions, getVideoDimensions, getVideoDuration, getDateTakenFromPath, shutdownExifTool } from '$helpers/imagehelper';
import fs from 'fs/promises';
import path from 'path';
import type { PhotoServerModel, PhotoModel } from '$api';

const originalsDir = env.ORIGINAL_PHOTOS || '/originals';
const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const metaDataFilename = path.join(thumbsDir, env.METADATA_FILE || 'metadata.json');
const errorLogFilename = path.join(thumbsDir, env.ERRORS_FILE || 'errors.log');
const thumbnailSizeWidth = Number(env.THUMBNAIL_SIZE) || 300;
const mediumSizeWidth = Number(env.MEDIUM_SIZE) || 1200;
const videoExts = ['.mp4', '.mov'];
const imageExts = ['.jpg', '.jpeg', '.heic', '.heif', '.png'];

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let pendingEvents: Map<string, 'add' | 'unlink' | 'change'> = new Map();

function buildThumbnailPath(guid: string): { thumb: string; medium: string; dir: string } {
    const sub1 = guid.substring(0, 2);
    const sub2 = guid.substring(2, 4);
    const dir = path.join(thumbsDir, sub1, sub2);
    return {
        dir,
        thumb: path.join(dir, guid + '.webp'),
        medium: path.join(dir, guid + '-medium.webp')
    };
}

async function cleanupThumbnails(guid: string) {
    const { thumb, medium } = buildThumbnailPath(guid);
    await fs.unlink(thumb).catch(() => { });
    await fs.unlink(medium).catch(() => { });
}

function countDuplicates(photoMetadata: PhotoServerModel[]): Map<string, number> {
    const hashCounts = new Map<string, number>();
    for (const photo of photoMetadata) {
        const count = hashCounts.get(photo.guid) || 0;
        hashCounts.set(photo.guid, count + 1);
    }
    return hashCounts;
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
    let type: 'photo' | 'video' | 'live-photo-video' = 'photo';
    let lengthSeconds: number | null = null;

    if (isVideo) {
        [width, height] = await getVideoDimensions(filePath);
        lengthSeconds = await getVideoDuration(filePath);

        let dateTakenFromSidecar = false;
        for (const imgExt of imageExts) {
            const fileInfoWithoutExt = filePath.substring(0, filePath.lastIndexOf('.'));
            const sidecarPath = fileInfoWithoutExt + imgExt;
            const referencePhoto = existingPhotos.find(x => x.location === sidecarPath);
            if (referencePhoto) {
                dateTakenFromSidecar = true;
                dateTaken = referencePhoto.dateTaken;
                type = 'live-photo-video';
                break;
            }
        }

        if (!dateTakenFromSidecar) {
            dateTaken = await getDateTakenFromPath(filePath) as string;
            if (lengthSeconds < 4) {
                type = 'live-photo-video';
            } else {
                type = 'video';
            }
        }
    } else {
        [width, height] = await getImageDimensions(filePath, ext);
        dateTaken = await getDateTakenFromPath(filePath) as string;
    }

    return {
        guid: await getFileContentHash(filePath),
        location: filePath,
        name: name,
        dateTaken: dateTaken,
        type: type,
        width: width,
        height: height,
        lengthSeconds: lengthSeconds,
        sizeKb: Math.floor(stat.size / 1024)
    };
}

async function generateThumbnails(photoMeta: PhotoServerModel) {
    const ext = path.extname(photoMeta.location).toLowerCase();
    const isHeic = ext === '.heic' || ext === '.heif';
    const { dir, thumb, medium } = buildThumbnailPath(photoMeta.guid);
    await fs.mkdir(dir, { recursive: true });

    const isVideo = photoMeta.type === 'video' || photoMeta.type === 'live-photo-video';

    const thumbExists = await fs.stat(thumb).then(() => true).catch(() => false);
    if (!thumbExists) {
        const w = thumbnailSizeWidth;
        const h = Math.floor(photoMeta.height * (w / photoMeta.width));
        if (isVideo) {
            await generateVideoThumbnail(photoMeta.location, thumb, w, h);
        } else {
            await generateThumbnailBytes(photoMeta.location, w, h, thumb, 80, isHeic);
        }
    }

    const mediumExists = await fs.stat(medium).then(() => true).catch(() => false);
    const mediumSizeWidthMin = Math.min(photoMeta.width, mediumSizeWidth);
    const mediumSizeHeight = Math.floor(photoMeta.height * (mediumSizeWidthMin / photoMeta.width));
    if (!mediumExists) {
        if (isVideo) {
            await generateVideoThumbnail(photoMeta.location, medium, mediumSizeWidthMin, mediumSizeHeight, 1);
        } else {
            await generateThumbnailBytes(photoMeta.location, mediumSizeWidthMin, mediumSizeHeight, medium, 99, isHeic);
        }
    }
}

async function processPendingEvents() {
    const events = new Map(pendingEvents);
    pendingEvents.clear();
    
    let photoMetadata: PhotoServerModel[] = memoryCache[photosMetaCacheKey] || [];
    if (photoMetadata.length === 0) {
        try {
            const metaRaw = await fs.readFile(metaDataFilename, 'utf-8');
            photoMetadata = JSON.parse(metaRaw);
        } catch {
            console.log('No existing metadata to sync with');
            return;
        }
    }

    const hashCounts = countDuplicates(photoMetadata);
    const existingHashes = new Set(photoMetadata.map(p => p.guid));

    for (const [filePath, eventType] of events) {
        if (!isValidFile(filePath)) continue;

        try {
            if (eventType === 'add' || eventType === 'change') {
                const exists = await fs.stat(filePath).then(() => true).catch(() => false);
                if (!exists) continue;

                console.log(`File ${eventType}: ${filePath}`);
                
                const existingIndex = photoMetadata.findIndex(p => p.location === filePath);
                if (existingIndex !== -1) {
                    const existing = photoMetadata[existingIndex];
                    await cleanupThumbnails(existing.guid);
                    photoMetadata.splice(existingIndex, 1);
                    existingHashes.delete(existing.guid);
                }

                const photoMeta = await indexSingleFile(filePath, photoMetadata);
                if (!photoMeta) continue;

                const isDuplicate = existingHashes.has(photoMeta.guid);
                if (isDuplicate) {
                    const original = photoMetadata.find(p => p.guid === photoMeta.guid);
                    if (original) {
                        photoMeta.duplicateOf = original.guid;
                    }
                }
                existingHashes.add(photoMeta.guid);
                photoMetadata.push(photoMeta);

                await generateThumbnails(photoMeta);
            } 
            else if (eventType === 'unlink') {
                console.log(`File deleted: ${filePath}`);
                
                const existingIndex = photoMetadata.findIndex(p => p.location === filePath);
                if (existingIndex !== -1) {
                    const removed = photoMetadata[existingIndex];
                    const remainingForHash = photoMetadata.filter(p => p.guid === removed.guid && p.location !== filePath);
                    
                    if (remainingForHash.length === 0) {
                        await cleanupThumbnails(removed.guid);
                    } else {
                        const original = photoMetadata.find(p => p.guid === removed.guid && !p.duplicateOf);
                        if (original && removed.duplicateOf === original.guid) {
                            const newPrimary = remainingForHash[0];
                            for (const dup of remainingForHash) {
                                dup.duplicateOf = undefined;
                            }
                        }
                    }
                    photoMetadata.splice(existingIndex, 1);
                }
            }
        } catch (e) {
            console.error(`Error processing ${eventType} for ${filePath}:`, e);
            const now = new Date().toISOString();
            await fs.appendFile(errorLogFilename, `[${now}] Watcher error: ${filePath}. Exception: ${e}\n`);
        }
    }

    photoMetadata.sort((a, b) => a.dateTaken.localeCompare(b.dateTaken));
    memoryCache[photosMetaCacheKey] = photoMetadata;
    await fs.writeFile(metaDataFilename, JSON.stringify(photoMetadata));
    console.log('Metadata updated from file watcher');
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