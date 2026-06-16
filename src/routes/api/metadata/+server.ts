import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private'
import type { PhotoServerModel, PhotoModel } from '$api';
import { getImageDimensions, getVideoDimensions, getVideoDuration, generateVideoThumbnail, getHashString, generateThumbnailBytes, generateVideoLoopClip, getDateTakenFromPath } from '$helpers/imagehelper';
import { getFileInfosRecursively, photosMetaCacheKey } from '$helpers/filehelper';
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

/// GET /api/metadata
/// Returns all photo metadata with embedded favorites, trash, and URL fields,
/// sorted by dateTaken descending
export const GET: RequestHandler = async ({ url }) => {
    await loadPhotos();
    const photos: PhotoServerModel[] = memoryCache[photosMetaCacheKey] || [];

    // Read favorites
    let favoriteSet = new Set<string>();
    try {
        const favExists = await fs.stat(favoritesFilename).then(() => true).catch(() => false);
        if (favExists) {
            const favRaw = await fs.readFile(favoritesFilename, 'utf-8');
            const favArray: string[] = JSON.parse(favRaw);
            favoriteSet = new Set(favArray);
        }
    } catch {
        // No favorites file yet, use empty set
    }

    // Read trash
    let trashSet = new Set<string>();
    try {
        const trashExists = await fs.stat(trashFilename).then(() => true).catch(() => false);
        if (trashExists) {
            const trashRaw = await fs.readFile(trashFilename, 'utf-8');
            const trashArray: string[] = JSON.parse(trashRaw);
            trashSet = new Set(trashArray);
        }
    } catch {
        // No trash file yet, use empty set
    }

    const result: PhotoModel[] = photos.map(x => ({
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
        // Push any "error-no-date-found" entries to the end
        if (a.dateTaken === 'error-no-date-found' && b.dateTaken !== 'error-no-date-found') return 1;
        if (b.dateTaken === 'error-no-date-found' && a.dateTaken !== 'error-no-date-found') return -1;

        // Otherwise, normal descending sort by dateTaken
        return b.dateTaken.localeCompare(a.dateTaken);
    });
    return new Response(JSON.stringify(result), { status: 200 });
};
