import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { env } from '$env/dynamic/private'
import { getFileInfosRecursively } from '$helpers/filehelper';
import { getHashString } from '$helpers/imagehelper';

const INPUT_DIR = env.ORIGINAL_PHOTOS || '/originals';
const OUTPUT_DIR = env.GENERATED_THUMBNAILS || '/thumbs';
// const INPUT_DIR = "input";
// const OUTPUT_DIR = "output";

const MAX_WIDTH_THUMBNAIL = Number(env.THUMBNAIL_SIZE) || 300;
const MAX_WIDTH_MEDIUM = Number(env.MEDIUM_SIZE) || 1200;
const QUALITY = 90;         // ignored when LOSSLESS = true
const LOSSLESS = false;     // true => lossless WebP
const CONCURRENCY = 6;      // parallel ffmpeg processes
const SUPPORTED_EXT = ['.jpg', '.jpeg', '.heic', '.heif', '.png'];

// Recursively scan directory
// function walk(dir: string): Promise<Array<{ FullName: string; Name: string; Extension: string; Length: number }>> {
  // return getFileInfosRecursively(dir);
  // let results: string[] = [];
  // for (const file of fs.readdirSync(dir)) {
  //   const full = path.join(dir, file);
  //   const stat = fs.statSync(full);
  //   if (stat.isDirectory()) results = results.concat(walk(full));
  //   else results.push(full);
  // }
  // return results;
// }

// // Create SHA1 hash from relative path
// function makeHash(relPath: string): string {
//   return crypto.createHash("sha1").update(relPath).digest("hex");
// }

// Build output path: output/ab/cd/abcdefgh.webp
function buildOutputPath(srcPath: string) {
  // relative path of ex. 
  // 'input/photos/travel/IMG_1023.HEIC'  
  // ->
  // 'photos/travel/IMG_1023.HEIC'
  // const rel = path.relative(INPUT_DIR, srcPath);
  const hash = getHashString(srcPath);

  const sub1 = hash.substring(0, 2);
  const sub2 = hash.substring(2, 4);

  const outDir = path.join(OUTPUT_DIR, sub1, sub2);
  const outFile = path.join(outDir, `${hash}.webp`);
  const outFileMedium = path.join(outDir, `${hash}-medium.webp`);

  fs.mkdirSync(outDir, { recursive: true });

  return { outDir, outFile, outFileMedium };
}

// Spawn ffmpeg process to convert single file to webp
function convertFile(src: { FullName: string; Name: string; Extension: string; Length: number; }
): Promise<void> {
  const { outDir, outFile, outFileMedium } = buildOutputPath(src.FullName);

  const files = [
    {filename: outFile, width: MAX_WIDTH_THUMBNAIL}, 
    {filename: outFileMedium, width: MAX_WIDTH_MEDIUM}
  ];
  
  // const currentFile = src.mediumSize ? outFileMedium : outFile;

  files.forEach((currentObj) => {
    // If output file already exists, skip
    if (fs.existsSync(currentObj.filename)) {
      console.log(`Skipping (already exists): ${currentObj.filename}`);
      return Promise.resolve(0);
    }
    
    console.log(`Convert: ${src.FullName} → ${currentObj.filename}`);
    
    let args = [
      "-i", src.FullName,
      "-map_metadata", "0", // preserve metadata
      "-vf", `scale='min(${currentObj.width},iw)':-1`,
      // '-vf', `scale='min(${currentObj.width},iw)':'min(${currentObj.width},ih)':force_original_aspect_ratio=decrease`,
      '-c:v', 'libwebp', // use webp encoder
      '-preset', 'picture', // better quality for still images
      '-pix_fmt', 'yuv420p', // color compatibility
    ];
    
    if (src.Extension === '.mp4' || src.Extension === '.mov') {
      args.push('-ss', '1'); // seek to time
      args.push('-frames:v', '1'); // extract one frame
    }
    if (src.Extension === '.heic' || src.Extension === '.heif') {
      // args = args.filter((item) => item !== '-c:v' && item !== 'libwebp');
      args = args.filter((item) => item !== '-preset' && item !== 'picture');
      // args = args.filter((item) => item !== '-c:v' && item !== 'libwebp');
      // args.push('-c:v', 'hevc'); // use heif encoder

      // args.push('-map','0:sg:0'); //Force the first video stream (color)
      // args.push('-primary_image'); //Force the first video stream (color)
    }
    
    if (LOSSLESS) {
      args.push("-lossless", "1");
    } else {
      args.push("-quality", QUALITY.toString());
    }
    
    args.push(currentObj.filename);
    
    const ff = spawn("ffmpeg", args, { stdio: "inherit" });
    // const ff = spawn("ffmpeg", args);//, { stdio: "inherit" });
    
    ff.on("close", (code) => {
      // if (code === 0) resolve(0);
      if (code != 0) Promise.reject(new Error(`ffmpeg failed with code ${code}: ${src.FullName}`));
      // else reject(new Error(`ffmpeg failed with code ${code}: ${src}`));
    });

    ff.on("error", (err) => {
      Promise.reject(err);
    });
  });
  return Promise.resolve(void 0);
}

// Concurrency queue
async function runQueue(items: Array<{ FullName: string; Name: string; Extension: string; Length: number }>, 
  worker: (item: { FullName: string; Name: string; Extension: string; Length: number; }) => Promise<void>, 
  concurrency: number) {
  // Add width to each items array
  // items = items.map(item => ({ ...item, width: width, mediumSize: mediumSize }));
  const queue = [...items];
  let active = 0;

  return new Promise((resolve) => {
    function next() {
      if (queue.length === 0 && active === 0) return resolve(0);

      if (active >= concurrency || queue.length === 0) return;

      const item = queue.shift();
      active++;

      if (item === undefined) {
        active--;
        return next();
      }

      worker(item)
      .catch((err) => console.error(err.message))
      .finally(() => {
        active--;
        next();
      });

      next();
    }

    next();
  });
}

// Main function to convert all files in input directory
export async function convert() {
  const files = (await getFileInfosRecursively(INPUT_DIR)).filter((f) =>
    SUPPORTED_EXT.includes(f.Extension)
  );

  console.log(`Found ${files.length} file(s).`);
  console.log(`Parallel: ${CONCURRENCY}, Lossless: ${LOSSLESS}, Quality: ${QUALITY}`);

  await runQueue(files, convertFile, CONCURRENCY);

  console.log("Done!");
};

// Alternative API to convert specific items
export async function convertItems(items: Array<{ FullName: string; Name: string; Extension: string; Length: number }>) {
  await runQueue(items, convertFile, CONCURRENCY);
}
