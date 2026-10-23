import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private'
import type { DateIndexEntry, MetadataRangeResponse, PhotoServerModel, PhotoModel } from '$api';
import { getImageDimensions, getVideoDimensions, getVideoDuration, getHashString, getDateTakenFromPath } from '$helpers/imagehelper';
import { getFileInfosRecursively, photosMetaCacheKey, photosVersionKey, photosLoadedKey, writeJsonAtomic, withIngestionLock, normalizeLivePhotoLinks } from '$helpers/filehelper';
import { memoryCache } from '$helpers/memorycache';
import { scheduleMediaRepair } from '$lib/server/media';

const originalsDir = env.ORIGINAL_PHOTOS || '/originals';
const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const metaDataFilename = path.join(thumbsDir, env.METADATA_FILE || 'metadata.json');
const errorLogFilename = path.join(thumbsDir, env.ERRORS_FILE || 'errors.log');
const favoritesFilename = path.join(thumbsDir, env.FAVORITES_FILE || 'favorites.json');
const trashFilename = path.join(thumbsDir, env.TRASH_FILE || 'trash.json');
const defaultRangeSize = Number(env.METADATA_RANGE_SIZE) || 200;
const videoExts = ['.mp4', '.mov'];
const imageExts = ['.jpg', '.jpeg', '.heic', '.heif', '.png'];

// Load photos, indexing any new/changed files. Concurrent callers share one run,
// and the run takes the shared ingestion lock so the watcher cannot interleave a
// metadata write while the initial scan is still building its array.
let loadPhotosPromise: Promise<void> | null = null;

const loadPhotos = async (): Promise<void> => {
    if (memoryCache[photosLoadedKey]) return;
    if (loadPhotosPromise) return loadPhotosPromise;

    loadPhotosPromise = withIngestionLock(loadPhotosInternal).finally(() => {
        loadPhotosPromise = null;
    });
    return loadPhotosPromise;
};

const loadPhotosInternal = async (): Promise<void> => {
    if (memoryCache[photosLoadedKey]) return;

    // Check if originalsDir directory exists
    try {
        await fs.stat(originalsDir);
    } catch {
        console.error('Original photos directory ' + originalsDir + ' does not exist');
        return;
    }

    // Create thumbs dir if not exists
    await fs.mkdir(thumbsDir, { recursive: true });

    // First, get all original photo and video files
    let originalPhotos = await getFileInfosRecursively(originalsDir);
    originalPhotos = originalPhotos.filter(x =>
        imageExts.includes(x.extension)
        || videoExts.includes(x.extension)
    );

    let photoMetadata: PhotoServerModel[] = [];
    let metaExists = false;

    // The watcher may already have loaded (and updated) metadata while this first
    // request was on its way in. Reuse that instead of reading a stale file over it.
    const cachedPhotos = memoryCache[photosMetaCacheKey];
    if (Array.isArray(cachedPhotos) && cachedPhotos.length > 0) {
        photoMetadata = [...(cachedPhotos as PhotoServerModel[])];
        normalizeLivePhotoLinks(photoMetadata);
        metaExists = true;
    } else {
        metaExists = await fs.stat(metaDataFilename).then(() => true).catch(() => false);
        if (metaExists) {
            try {
                const metaRaw = await fs.readFile(metaDataFilename, 'utf-8');
                const parsed = JSON.parse(metaRaw);
                if (Array.isArray(parsed)) {
                    photoMetadata = parsed;
                    normalizeLivePhotoLinks(photoMetadata);
                } else {
                    metaExists = false;
                }
            } catch (e) {
                console.error('Error reading metadata file, rebuilding from originals:', e);
                photoMetadata = [];
                metaExists = false;
            }
        }
    }

    const originalPhotosLocs = originalPhotos.map(x => x.fullName);
    const originalPhotosLocSet = new Set(originalPhotosLocs);
    const photoMetadataLocSet = new Set(photoMetadata.map(x => x.location));

    const photoLocsToIndex = originalPhotosLocs.filter(loc => !photoMetadataLocSet.has(loc));
    const photosToRemove = photoMetadata.filter(x => !originalPhotosLocSet.has(x.location));

    if (metaExists) {
        console.log(`Syncing photos/videos with metadata file...`);
    }

    if (photosToRemove.length > 0) {
        console.log(`Removing metadata and thumbnails for ${photosToRemove.length} photos/videos`);
        const removeSet = new Set(photosToRemove.map(x => x.location));
        photoMetadata = photoMetadata.filter(x => !removeSet.has(x.location));

        for (const removed of photosToRemove) {
            const dir = path.join(thumbsDir, removed.guid.substring(0, 2), removed.guid.substring(2, 4));
            await fs.unlink(path.join(dir, removed.guid + '.webp')).catch(() => { });
            await fs.unlink(path.join(dir, removed.guid + '-medium.webp')).catch(() => { });
            await fs.unlink(path.join(dir, removed.guid + '-loop.mp4')).catch(() => { });
            await fs.unlink(path.join(dir, removed.guid + '_loop.mp4')).catch(() => { });
        }
    }

    if (metaExists) {
        console.log(`Indexing ${photoLocsToIndex.length} new photos/videos`);
    }

    const photosToIndex = originalPhotos.filter(x => photoLocsToIndex.includes(x.fullName));

    // Order by photos first, videos second. This is important for Live Photo
    // detection: the still image must already be in photoMetadata when its video
    // is indexed (the user may add a photo and its .MOV in the same scan).
    photosToIndex.sort((a, b) => {
        const aIsVideo = videoExts.includes(a.extension);
        const bIsVideo = videoExts.includes(b.extension);
        if (aIsVideo && !bIsVideo) return 1;
        if (!aIsVideo && bIsVideo) return -1;
        return 0;
    });

    let i = 0;
    for (const fileInfo of photosToIndex) {
        console.debug(`Indexing: ${fileInfo.fullName}`);
        try {
            let bytes: Buffer;
            let width: number = 0;
            let height: number = 0;
            let dateTaken: string = 'unknown';
            let type: 'photo' | 'video' | 'short-video' | 'live-photo-video' = 'photo';
            let lengthSeconds: number | null = null;
            let referenceGuid: string | null = null;
            const guid = getHashString(fileInfo.fullName);
            const isVideo = videoExts.includes(fileInfo.extension);

            if (isVideo) {
                [width, height] = await getVideoDimensions(fileInfo.fullName);
                lengthSeconds = await getVideoDuration(fileInfo.fullName);

                // Check if this is a live photo video by looking for a same-named
                // photo file in the same folder (case-insensitive).
                if (lengthSeconds < 6) {
                    const fileInfoWithoutExt = fileInfo.fullName.substring(0, fileInfo.fullName.lastIndexOf('.'));
                    for (const imgExt of imageExts) {
                        const sidecarPath = fileInfoWithoutExt + imgExt;
                        const referencePhoto = photoMetadata.find(x => x.location.toLowerCase() === sidecarPath.toLowerCase());
                        if (referencePhoto) {
                            console.info(`Reference live photo found: ${sidecarPath}`);
                            type = 'live-photo-video';
                            // Use date from reference photo
                            dateTaken = referencePhoto.dateTaken;
                            referenceGuid = referencePhoto.guid;
                            // Set the reference photo's sidecarGuid to this live photo video file
                            referencePhoto.sidecarGuid = guid;
                            break;
                        }
                    }
                }

                // Not marked as live photo above
                if (type === 'photo') {
                    dateTaken = await getDateTakenFromPath(fileInfo.fullName) as string;
                    type = (lengthSeconds < 4) ? 'short-video' : 'video';
                }
            } else {
                bytes = await fs.readFile(fileInfo.fullName);
                [width, height] = await getImageDimensions(bytes);
                dateTaken = await getDateTakenFromPath(fileInfo.fullName) as string;
            }

            // Create metadata object
            const photoMeta: PhotoServerModel = {
                dateTaken: dateTaken,
                guid: guid,
                location: fileInfo.fullName,
                name: fileInfo.name,
                type: type,
                width: width,
                height: height,
                lengthSeconds: lengthSeconds,
                sizeKb: Math.floor(fileInfo.length / 1024),
                isFavorite: false,
                isTrash: false,
                sidecarGuid: null,
                referenceGuid: referenceGuid
            };
            photoMetadata.push(photoMeta);

            // Media generation is queued in the background (bounded concurrency),
            // so indexing a large library is not blocked by sharp/ffmpeg.
            scheduleMediaRepair([photoMeta]);

            // Only write to file every 50th photo to reduce disk writes. A crash
            // midway is recoverable: the next scan indexes the remaining files.
            i = (i + 1) % 50;
            if (i === 0) {
                await writeJsonAtomic(metaDataFilename, photoMetadata);
            }
        } catch (e) {
            const now = new Date().toISOString();
            await fs.appendFile(errorLogFilename, `[${now}] Error loading photo: ${fileInfo.fullName}. Exception: ${e}\n`);
        }
    }

    // Rebuild/validate links after all photos have been indexed.
    normalizeLivePhotoLinks(photoMetadata);
    photoMetadata.sort((a, b) => a.dateTaken.localeCompare(b.dateTaken));

    // Fill in any thumbnails/medium images/loop clips missing for already-indexed
    // entries (e.g. cache cleared, first scan crashed, thumbnail sizes changed).
    scheduleMediaRepair(photoMetadata);

    await writeJsonAtomic(metaDataFilename, photoMetadata);
    memoryCache[photosMetaCacheKey] = photoMetadata;
    memoryCache[photosVersionKey] = (memoryCache[photosVersionKey] || 0) + 1;
    memoryCache[photosLoadedKey] = true;
};

interface ViewParams {
    order: 'asc' | 'desc';
    trash: 'hide' | 'only';
    fav: boolean;
    types: string[];
}

interface MetadataView {
    list: PhotoModel[];
    dateIndex: DateIndexEntry[];
}

// Filters matching what the client offers in its filter menu.
// Note: live-photo-video entries that belong to a still photo are always hidden,
// since they are shown through their reference photo instead.
const typePredicates: Record<string, (p: PhotoModel) => boolean> = {
    photo: p => p.type === 'photo' && p.sidecarGuid == null,
    live: p => p.sidecarGuid != null,
    video: p => p.type === 'video',
    'short-video': p => p.type === 'short-video'
};

// Cache of the last built (filtered + sorted) view, keyed by filter params and
// anything that can invalidate it (metadata version, favorites/trash file mtimes)
let viewCache: { key: string; view: MetadataView } | null = null;

const readGuidSet = async (filename: string): Promise<Set<string>> => {
    try {
        const exists = await fs.stat(filename).then(() => true).catch(() => false);
        if (!exists) return new Set<string>();
        const raw = await fs.readFile(filename, 'utf-8');
        return new Set<string>(JSON.parse(raw));
    } catch {
        return new Set<string>();
    }
};

const fileMtime = (filename: string): Promise<number> =>
    fs.stat(filename).then(s => s.mtimeMs).catch(() => 0);

// One entry per distinct date group (month) so the client can build a date picker
// without downloading all photos. Non-standard dates (e.g. 'error-no-date-found')
// are grouped by their first 7 characters instead.
const buildDateIndex = (list: PhotoModel[]): DateIndexEntry[] => {
    const dateIndex: DateIndexEntry[] = [];
    let lastKey: string | null = null;
    for (let i = 0; i < list.length; i++) {
        const key = (list[i].dateTaken || '').substring(0, 7);
        if (lastKey === null || key !== lastKey) {
            dateIndex.push({ index: i, dateTaken: list[i].dateTaken });
            lastKey = key;
        }
    }
    return dateIndex;
};

// Build (or reuse a cached) filtered + sorted view of all photos, including its date index
const getView = async (photos: PhotoServerModel[], params: ViewParams): Promise<MetadataView> => {
    const version = memoryCache[photosVersionKey] || 0;
    const [favMtime, trashMtime] = await Promise.all([fileMtime(favoritesFilename), fileMtime(trashFilename)]);
    const cacheKey = JSON.stringify(params) + '|' + version + '|' + photos.length + '|' + favMtime + '|' + trashMtime;
    if (viewCache && viewCache.key === cacheKey) return viewCache.view;

    const favoriteSet = await readGuidSet(favoritesFilename);
    const trashSet = await readGuidSet(trashFilename);
    const typeFns = params.types.map(t => typePredicates[t]).filter(fn => fn != null);

    const list: PhotoModel[] = photos
        .filter(x => (params.trash === 'only') === trashSet.has(x.guid))
        .filter(x => !(x.type === 'live-photo-video' && x.referenceGuid))
        .filter(x => typeFns.length === 0 || typeFns.some(fn => fn(x)))
        .filter(x => !params.fav || favoriteSet.has(x.guid))
        .map(x => ({
            dateTaken: x.dateTaken,
            guid: x.guid,
            name: x.name,
            type: x.type,
            sizeKb: x.sizeKb,
            width: x.width,
            height: x.height,
            lengthSeconds: x.lengthSeconds,
            isFavorite: favoriteSet.has(x.guid),
            isTrash: trashSet.has(x.guid),
            sidecarGuid: x.sidecarGuid,
            referenceGuid: x.referenceGuid
        }))
        .sort((a, b) => {
            // Push any "error-no-date-found" entries to the end, in both sort orders
            const aError = a.dateTaken === 'error-no-date-found';
            const bError = b.dateTaken === 'error-no-date-found';
            if (aError && !bError) return 1;
            if (bError && !aError) return -1;

            return params.order === 'asc'
                ? a.dateTaken.localeCompare(b.dateTaken)
                : b.dateTaken.localeCompare(a.dateTaken);
        });

    const view: MetadataView = { list, dateIndex: buildDateIndex(list) };
    viewCache = { key: cacheKey, view };
    return view;
};

/// GET /api/metadata
/// Returns photo metadata in ranges (paged), together with the total number of
/// matching photos and a compact date index for the date picker.
///
/// Query params:
///   range  - 0-based range index to return (default 0)
///   size   - number of photos per range (default 200)
///   order  - "desc" (newest first, default) or "asc" (oldest first)
///   trash  - "hide" (default) or "only"
///   fav    - "1" to only include favorites
///   types  - comma separated subset of: photo,live,video,short-video (default: all)
export const GET: RequestHandler = async ({ url }) => {
    await loadPhotos();
    const photos: PhotoServerModel[] = memoryCache[photosMetaCacheKey] || [];

    const typesParam = (url.searchParams.get('types') || '')
        .split(',')
        .map(t => t.trim())
        .filter(t => t in typePredicates);
    const params: ViewParams = {
        order: url.searchParams.get('order') === 'asc' ? 'asc' : 'desc',
        trash: url.searchParams.get('trash') === 'only' ? 'only' : 'hide',
        fav: url.searchParams.get('fav') === '1',
        types: typesParam
    };
    const rangeSize = Math.max(1, parseInt(url.searchParams.get('size') || '', 10) || defaultRangeSize);
    const rangeIndex = Math.max(0, parseInt(url.searchParams.get('range') || '', 10) || 0);

    const { list, dateIndex } = await getView(photos, params);
    const start = rangeIndex * rangeSize;
    const payload: MetadataRangeResponse = {
        total: list.length,
        rangeSize,
        rangeIndex,
        photos: list.slice(start, start + rangeSize),
        dateIndex
    };
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
};
