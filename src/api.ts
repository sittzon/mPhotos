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