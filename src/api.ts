export interface PhotoModel {
  dateTaken: string;
  guid: string;
  name: string;
  type: 'photo' | 'video' | 'live-photo-video';
  width: number;
  height: number;
  lengthSeconds: number | null;
  sizeKb: number;
  isFavorite: boolean;
  isTrash: boolean;
  sidecarGuid: string | null;
}

export interface PhotoServerModel extends PhotoModel {
    location: string;
}