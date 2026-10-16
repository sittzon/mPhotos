import type { Stats } from 'fs';

// Media guids hash the source file *path*, not its content, and the filewatcher
// regenerates thumbnails in place when a source file changes (same guid, new bytes).
// So generated media must not be served as "immutable". Instead use a freshness window
// plus a stat-based ETag: repeat views are served from cache without any request, and
// expired entries revalidate with a cheap 304 instead of a full refetch.
export const MEDIA_CACHE_CONTROL = 'public, max-age=604800'; // 7 days

export const getStatEtag = (stat: Stats): string => `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;

// Compare a request's If-None-Match header against our ETag (handles comma-separated lists and *)
export const isNotModified = (ifNoneMatch: string | null, etag: string): boolean => {
    if (!ifNoneMatch) return false;
    return ifNoneMatch === '*' || ifNoneMatch.split(',').some(tag => tag.trim() === etag);
};

export const mediaCacheHeaders = (contentType: string, etag: string): Record<string, string> => ({
    'Content-Type': contentType,
    'Cache-Control': MEDIA_CACHE_CONTROL,
    'ETag': etag,
});
