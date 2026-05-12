import sharp from 'sharp';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import heicConvert from "heic-convert";
import { ExifTool } from "exiftool-vendored";
import os from "os";

const cpuCount = os.cpus()?.length || 1;
// Tuning strategy: use at most CPUs or a fraction.
// If you expect many concurrent requests, increase; otherwise keep small to save memory.
const DEFAULT_MAX_PROCS = Math.max(1, Math.min(cpuCount, Number(process.env.EXIF_MAX_PROCS || cpuCount)));

// Create a single ExifTool manager. It will internally spawn up to `maxProcs` child exiftool processes.
let exiftool = new ExifTool({ maxProcs: DEFAULT_MAX_PROCS });

// Graceful shutdown: ensure child processes are closed when node exits.
// Use beforeExit/exit/SIGINT/SIGTERM to be safe in different environments.
export const shutdownExifTool = async () => {
  try {
    // `end()` is idempotent and returns a Promise that resolves when children are closed
    await exiftool.end();
    console.info("exiftool: ended");
  } catch (err) {
    console.error("exiftool: error during shutdown", err);
  }
};

process.once("beforeExit", shutdownExifTool);
process.once("SIGINT", async () => { await shutdownExifTool(); process.exit(0); });
process.once("SIGTERM", async () => { await shutdownExifTool(); process.exit(0); });


// Get image or video dimensions
export async function getImageDimensions(input: Buffer | string, extension?: string): Promise<[number, number]> {
    // If input is a file path, use extension or infer from path
    let ext = extension;
    let filePath: string | undefined;
    let buffer: Buffer | undefined;
    if (typeof input === 'string') {
        filePath = input;
        ext = ext || filePath.split('.').pop()?.toLowerCase();
    } else {
        buffer = input;
        // If extension is not provided, default to image
    }

    // Supported video extensions
    const videoExts = ['mp4', 'mov'];
    if (ext && videoExts.includes(ext)) {
        if (!filePath) throw new Error('Video dimension extraction requires file path');
        return await getVideoDimensions(filePath);
    }
    // Otherwise, treat as image
    let imgBuffer: Buffer;
    if (buffer) {
        imgBuffer = buffer;
    } else if (filePath) {
        imgBuffer = await fs.readFile(filePath);
    } else {
        throw new Error('No buffer or file path provided for image dimension extraction');
    }
    const img = sharp(imgBuffer).rotate();
    const meta = await img.metadata();
    return [meta.width ?? 0, meta.height ?? 0];
}

// Helper to get video dimensions using ffprobe
export async function getVideoDimensions(filePath: string): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=p=0',
            filePath
        ]);
        let output = '';
        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });
        ffprobe.stderr.on('data', (data) => {
            // Ignore ffprobe errors for missing metadata
        });
        ffprobe.on('close', (code) => {
            const [width, height] = output.trim().split(',').map(Number);
            if (width && height) {
                resolve([width, height]);
            } else {
                reject(new Error('Could not get video dimensions'));
            }
        });
        ffprobe.on('error', (err) => {
            reject(err);
        });
    });
}

// Helper to get video duration using ffprobe
export async function getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        let output = '';
        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });
        ffprobe.stderr.on('data', (data) => {
            // Ignore ffprobe errors for missing metadata
        });
        ffprobe.on('close', (code) => {
            const duration = parseFloat(output.trim());
            if (!isNaN(duration)) {
                resolve(duration);
            } else {
                reject(new Error('Could not get video duration'));
            }
        });
        ffprobe.on('error', (err) => {
            reject(err);
        });
    });
}

// Helper to get video creation date using ffprobe
export async function getVideoDateTaken(filePath: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream_tags=creation_time',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        let output = '';
        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });
        ffprobe.stderr.on('data', (data) => {
            // Ignore ffprobe errors for missing metadata
        });
        ffprobe.on('close', (code) => {
            const dateStr = output.trim();
            if (dateStr) {
                // Format: 2023-04-11T10:34:30.000000Z
                // Convert to YYYY-MM-DD HH:MM:SS
                const formatted = dateStr.replace('T', ' ').replace(/\..*Z$/, '');
                resolve(formatted);
            } else {
                resolve('error-no-date-found');
            }
        });
        ffprobe.on('error', (err) => {
            reject(err);
        });
    });
}

export async function getDateTakenFromPath(imagePath: string): Promise<string | null> {
    // Check file extension to determine if it's a video
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const videoExts = ['mp4', 'mov'];
    if (ext && videoExts.includes(ext)) {
        // Use ffprobe for video files
        try {
            const videoDate = await getVideoDateTaken(imagePath);
            return videoDate;
        } catch (error) {
            console.log('Error reading video date with ffprobe:', error, imagePath);
            return 'error-no-date-found';
        }
    }
    // Otherwise, treat as image and use EXIF
    try {
        if (!exiftool) exiftool = new ExifTool({ maxProcs: DEFAULT_MAX_PROCS });
        const tags = await exiftool.read(imagePath);
        // example: "2218:09:22 02:32:14"
        const dt = tags.DateTimeOriginal;

        //Skip if no valid dateTimeOriginal found
        if (!dt) {
            console.log(`No DateTimeOriginal tag found for ${imagePath}`);
            return 'error-no-date-found';
        }

        let dateTaken: string;
        if (typeof dt === 'string') {
            // Convert to "YYYY-MM-DD HH:MM:SS"
            dateTaken = dt.replace(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/, '$1-$2-$3 $4:$5:$6');
        } else if (dt && typeof dt === 'object' && typeof (dt as any).toISOString === 'function') {
            // ExifDateTime object from exiftool-vendored
            dateTaken = (dt as any).toISOString().replace('T', ' ').substring(0, 19);
        } else {
            return 'error-no-date-found';
        }
        return dateTaken;
    } catch (error) {
        console.log('Error reading EXIF data with ExifTool:', error, imagePath);
        return 'error-no-date-found';
    }
}

// SHA-256 string to hash
export function getHashString(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex');
}

const HASH_CHUNK_SIZE = 512 * 1024;
export async function getFileContentHash(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const fileHandle = await fs.open(filePath, 'r');
    try {
        const { buffer } = await fileHandle.read(Buffer.alloc(HASH_CHUNK_SIZE), 0, HASH_CHUNK_SIZE, 0);
        hash.update(buffer);
    } finally {
        await fileHandle.close();
    }
    return hash.digest('hex');
}

// Resize and save as webp
export async function generateThumbnailBytes(imagePath: string, w: number, h: number, outPath: string, quality = 80, isHeic: boolean = false): Promise<void> {
    let sharpBuffer: sharp.Sharp;
    const inputBuffer = await fs.readFile(imagePath);
    if (isHeic) {
        const outputBuffer = await heicConvert({
            buffer: inputBuffer, // the HEIC file buffer
            format: 'JPEG',      // output format
            quality: 1           // the jpeg compression quality, between 0 and 1
        });
        sharpBuffer = await sharp(outputBuffer).rotate(); // Auto-rotate based on EXIF
    }
    else {
        sharpBuffer = await sharp(inputBuffer).rotate() // Auto-rotate based on EXIF
    }

    var webFile = sharpBuffer
        .resize(w, h, { fit: 'inside' })
        .webp({ quality })
    try {
        await webFile.toFile(outPath);
    } catch (e) {
        console.log('Error saving image:', e);
    }
}

// Generate a thumbnail from a video file using ffmpeg
export async function generateVideoThumbnail(videoPath: string, outPath: string, w: number, h: number, timeSeconds = 1): Promise<void> {
    return new Promise((resolve, reject) => {
        // Extract frame, resize, encode as webp
        const ffmpeg = spawn('ffmpeg', [
            '-ss', String(timeSeconds), // seek to time
            '-i', videoPath,
            '-frames:v', '1', // extract one frame
            '-vf', `scale='min(${w},iw)':'min(${h},ih)':force_original_aspect_ratio=decrease`,
            '-c:v', 'libwebp', // use webp encoder
            '-quality', '90', // webp quality (0-100)
            '-lossless', '0', // lossy for better compression
            '-preset', 'picture', // better quality for still images
            '-pix_fmt', 'yuv420p', // color compatibility
            outPath
        ]);
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.log('Error generating video thumbnail, ffmpeg exited with code: ', code);
                reject(new Error('Failed to generate video thumbnail'));
            }
        });
        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}

// Generate a low-res loop clip for grid display (360px wide, no audio)
export async function generateVideoLoopClip(videoPath: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', videoPath,
            '-vf', 'scale=240:-2',
            '-c:v', 'libx264',
            '-crf', '30',
            '-preset', 'ultrafast',
            '-an',
            '-movflags', '+faststart',
            outPath
        ]);
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.log('Error generating loop clip, ffmpeg exited with code:', code);
                reject(new Error('Failed to generate loop clip'));
            }
        });
        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}