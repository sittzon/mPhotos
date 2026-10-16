import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private'
import type { DateIndexEntry, MetadataRangeResponse, PhotoServerModel, PhotoModel } from '$api';
import { getImageDimensions, getVideoDimensions, getVideoDuration, generateVideoThumbnail, getHashString, generateThumbnailBytes, generateVideoLoopClip, getDateTakenFromPath } from '$helpers/imagehelper';
import { getFileInfosRecursively, photosMetaCacheKey, photosVersionKey } from '$helpers/filehelper';
import { memoryCache } from '$helpers/memorycache';
import type { FileInfo } from '../../../models/fileInfo';

const originalsDir = env.ORIGINAL_PHOTOS || '/originals';
const thumbsDir = env.GENERATED_THUMBNAILS || '/thumbs';
const metaDataFilename = path.join(thumbsDir, env.METADATA_FILE || 'metadata.json');
const errorLogFilename = path.join(thumbsDir, env.ERRORS_FILE || 'errors.log');
const favoritesFilename = path.join(thumbsDir, env.FAVORITES_FILE || 'favorites.json');
const trashFilename = path.join(thumbsDir, env.TRASH_FILE || 'trash.json');
const thumbnailSizeWidth = Number(env.THUMBNAIL_SIZE) || 300;
const mediumSizeWidth = Number(env.MEDIUM_SIZE) || 1200;
const defaultRangeSize = Number(env.METADATA_RANGE_SIZE) || 200;
const videoExts = ['.mp4', '.mov'];
const imageExts = ['.jpg', '.jpeg', '.heic', '.heif', '.png'];

// Load photos
const loadPhotos = async () => {
    if (!memoryCache[photosMetaCacheKey]) {
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
        
        let photosToIndex = originalPhotos;
        let photoLocsToIndex = originalPhotos.map(x => x.fullName);
        let photoLocsToRemove: string[] = [];

        let photoMetadata: PhotoServerModel[] = [];
        // Check if metadata file exists and only index new photos not found in metadata file
        const metaExists = await fs.stat(metaDataFilename).then(() => true).catch(() => false);
        if (metaExists) {
            // If exists, load existing metadata
            const metaRaw = await fs.readFile(metaDataFilename, 'utf-8');
            photoMetadata = JSON.parse(metaRaw);

            const originalPhotosLocs = originalPhotos.map(x => x.fullName);
            const photoMetadataLocs = photoMetadata.map(x => x.location);

            // Filter out from photoMetadataLocs the ones that are not present in originalPhotosLocs 
            // (i.e. deleted files), and also add those that have not been indexed yet
            photoLocsToIndex = originalPhotosLocs.filter(loc => !photoMetadataLocs.includes(loc));
            photoLocsToRemove = photoMetadataLocs.filter(loc => !originalPhotosLocs.includes(loc));
        }

        if (metaExists) {
            console.log(`Syncing photos/videos with metadata file...`);
        }

        if (metaExists && photoLocsToRemove.length > 0) {
            // Remove deleted photos from metadata
            console.log(`Removing metadata and thumbnails for ${photoLocsToRemove.length} photos/videos`);
            photoMetadata = photoMetadata.filter(x => !photoLocsToRemove.includes(x.location));

            // Also remove their thumbnails and medium files
            for (const loc of photoLocsToRemove) {
                const guid = getHashString(loc);
                const thumbPath = path.join(thumbsDir, guid.substring(0, 2), guid.substring(2, 4), guid + '.webp');
                const mediumPath = path.join(thumbsDir, guid.substring(0, 2), guid.substring(2, 4), guid + '-medium.webp');
                await fs.unlink(thumbPath).catch(() => { });
                await fs.unlink(mediumPath).catch(() => { });
            }
        }        
        
        if (metaExists) {
            console.log(`Indexing ${photoLocsToIndex.length} new photos/videos`);
            photosToIndex = originalPhotos.filter(x => photoLocsToIndex.includes(x.fullName));
        }

        // Order by photos first, videos second
        // Will be important for checking for live photo references later
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
                let isVideo = videoExts.includes(fileInfo.extension);

                if (isVideo) {
                    [width, height] = await getVideoDimensions(fileInfo.fullName);
                    lengthSeconds = await getVideoDuration(fileInfo.fullName);

                    // Check if this is a live photo video by looking for a same-named photo file in the same folder
                    if (lengthSeconds < 6) // Only live-photo possible if length < 6 seconds; arbitrary
                    {
                        imageExts.forEach(async (imgExt) => {
                            const fileInfoWithoutExt = fileInfo.fullName.substring(0, fileInfo.fullName.lastIndexOf('.'));
                            const sidecarPath = path.join(fileInfoWithoutExt + imgExt);
                            // Check if photo exists in photoMetaData
                            const referencePhoto = photoMetadata.find(x => x.location.toLowerCase() === sidecarPath.toLowerCase());
                            if (referencePhoto) {
                                console.info(`Reference live photo found: ${sidecarPath}`);
                                type = 'live-photo-video';
                                // Use date from reference photo
                                dateTaken = referencePhoto.dateTaken;
                                referenceGuid = referencePhoto.guid;
                                // Set the reference photo's sidecarGuid to this live photo video file
                                referencePhoto.sidecarGuid = guid;
                                return;
                            }
                        });
                    }

                    // Not marked as live photo above
                    if (type === 'photo') { 
                        dateTaken = await getDateTakenFromPath(fileInfo.fullName) as string;
                        type = (lengthSeconds < 4)? 'short-video' : 'video';
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
                photoMetadata.sort((a, b) => a.dateTaken.localeCompare(b.dateTaken));

                // Generate thumbnail if not exists
                // live-photo-video files have their thumbnail/poster already set as their reference photo
                if (photoMeta.type !== 'live-photo-video')
                {
                    generateThumbnails(fileInfo, photoMeta, isVideo);
                }
                // Generate low-res loop clip for live photo videos
                else { 
                    const outDir = await createSubDirectoryRecursively(thumbsDir, photoMeta.guid);
                    const loopClipPath = path.join(outDir, photoMeta.guid + '-loop.mp4');
                    const loopClipExists = await fs.stat(loopClipPath).then(() => true).catch(() => false);
                    if (!loopClipExists) {
                        await generateVideoLoopClip(fileInfo.fullName, loopClipPath);
                    }
                }
                
                // Update in-memory cache
                memoryCache[photosMetaCacheKey] = photoMetadata;
                memoryCache[photosVersionKey] = (memoryCache[photosVersionKey] || 0) + 1;

                // Only write to file every 50th photo to reduce disk writes
                i = (i + 1) % 50;
                if (i === 0) {
                    await fs.writeFile(metaDataFilename, JSON.stringify(photoMetadata));
                }
            } catch (e) {
                const now = new Date().toISOString();
                await fs.appendFile(errorLogFilename, `[${now}] Error loading photo: ${fileInfo.fullName}. Exception: ${e}\n`);
            }
        }
        memoryCache[photosMetaCacheKey] = photoMetadata;
        await fs.writeFile(metaDataFilename, JSON.stringify(photoMetadata));
    }
}

const generateThumbnails = async (
    fileInfo: FileInfo, 
    photoMeta: PhotoServerModel,
    isVideo: boolean) => {
    const outDir = await createSubDirectoryRecursively(thumbsDir, photoMeta.guid);
    const isHeic = fileInfo.extension === '.heic' || fileInfo.extension === '.heif';
    
    // Generate main thumbnail
    const thumbPath = path.join(outDir, photoMeta.guid + '.webp');
    const thumbFileExists = await fs.stat(thumbPath).then(() => true).catch(() => false);
    if (!thumbFileExists) {
        const w = thumbnailSizeWidth;
        const h = Math.floor(photoMeta.height * (w / photoMeta.width));
        if (isVideo) {
            await generateVideoThumbnail(fileInfo.fullName, thumbPath, w, h);
        } else {
            await generateThumbnailBytes(fileInfo.fullName, w, h, thumbPath, 80, isHeic);
        }
    }
    
    // Generate medium size
    const mediumPath = path.join(outDir, photoMeta.guid + '-medium.webp');
    const mediumFileExists = await fs.stat(mediumPath).then(() => true).catch(() => false);
    const mediumSizeWidthMin = Math.min(photoMeta.width, mediumSizeWidth); // Don't upscale beyond original width
    const mediumSizeHeight = Math.floor(photoMeta.height * (mediumSizeWidthMin / photoMeta.width));
    if (!mediumFileExists) {
        if (isVideo) {
            await generateVideoThumbnail(fileInfo.fullName, mediumPath, mediumSizeWidthMin, mediumSizeHeight, 1);
        } else {
            await generateThumbnailBytes(fileInfo.fullName, mediumSizeWidthMin, mediumSizeHeight, mediumPath, 99, isHeic);
        }
    }
}

// Split output path into two level subfolders, based on first 4 characters of GUID
const createSubDirectoryRecursively = async (rootDir: string, guid: string) => {
    const sub1 = guid.substring(0, 2);
    const sub2 = guid.substring(2, 4);
    const outDir = path.join(rootDir, sub1, sub2);
    await fs.mkdir(outDir, { recursive: true });
    return outDir;
}

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
