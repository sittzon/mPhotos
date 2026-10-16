export interface PhotoModel {
  dateTaken: string;
  guid: string;
  name: string;
  type: 'photo' | 'video' | 'short-video' | 'live-photo-video';
  width: number;
  height: number;
  lengthSeconds: number | null;
  sizeKb: number;
  isFavorite: boolean;
  isTrash: boolean;
  sidecarGuid: string | null;
  referenceGuid: string | null;
}

export interface PhotoServerModel extends PhotoModel {
    location: string;
}

export interface DateIndexEntry {
    /** Index of the first photo of this date group in the current filtered/sorted order */
    index: number;
    /** dateTaken of the first photo of the group, e.g. "2024-03-01 12:00:00" */
    dateTaken: string;
}

export interface MetadataRangeResponse {
    /** Total number of photos matching the current filters, across all ranges */
    total: number;
    /** Number of photos per range */
    rangeSize: number;
    /** 0-based index of the returned range */
    rangeIndex: number;
    /** The photos of this range */
    photos: PhotoModel[];
    /** Compact month index over the full filtered/sorted list, for the date picker */
    dateIndex: DateIndexEntry[];
}