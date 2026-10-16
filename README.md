# mPhotos
mPhotos makes your local photo collection available as a lightning fast virtual grid in a self-hosted web application.

Point it at a folder of photos and videos and it will index them, generate small webp thumbnails in the background and show them in a scrollable grid you can browse by date. Nothing is ever modified in your originals folder - your photo library is treated as a read-only archive.

## Installation
You only need two directories: one with your original photos and one where thumbnails and metadata will be generated. Both can live anywhere on your disk.

### Docker
Map your originals and thumbnails directories in docker-compose.yml under **volumes:** and then run:
- `docker-compose up -d`

The first start builds the image and indexes your library, so give it a few minutes. When it is done, open **http://localhost:5174** in your browser.

### Local
Specify your originals directory and where you would like your thumbnails to be created in a new **.env** file. For example:
```
ORIGINAL_PHOTOS=/Users/you/Pictures
GENERATED_THUMBNAILS=/Users/you/Pictures/mphotos-thumbs
```
- *ORIGINAL_PHOTOS* - Originals directory (string), defaults to '/originals'
- *GENERATED_THUMBNAILS* - Thumbnail directory (string), defaults to '/thumbs' (will be created recursively if not present)

Then run:
- `npm install`
- `npm run host`

Open **http://localhost:5174** in your browser. On the very first page load mPhotos scans your originals folder, reads EXIF dates and generates thumbnails for every photo and video it finds. Large libraries take a while the first time - progress is logged to the console and thumbnails are generated in the background, so the grid fills in while you browse. After that, only new, changed or removed files are re-indexed. Files that fail to process are listed in *errors.log* in the thumbnails directory.

*Optional:* Use *THUMBNAIL_SIZE* and *MEDIUM_SIZE* (int) variables to tweak size of thumbnails and images used in PhotoSlider. The *METADATA_FILE* and *ERRORS_FILE* (string) can also be specified, defaults to 'metadata.json' and 'errors.log';

## Development
Define variables in **.env** as above and then run:
- `brew install ffmpeg-full`
- `npm install`
- `npm run dev`

The dev server runs with hot reload on **http://localhost:5173**. ffmpeg is only required for video thumbnails and live photo loop clips - photos work without it.

## Design goals
### Performance
Primary goal is great performance with a large amount (>10 000) of photos. This is primarily solved by using a virtual grid with small webp optimized thumbnails. A server that uses an ssd for thumbnail cache also never hurts. Has been tested using regular harddisks with good performance. 5GHz Wifi is strongly recommended though. 

### Simplicity
Secondary goal is ease of use. Other then being pretty simple (showing photos), this means that the entire library is considered a read-only archive. This also means that the following features will probably not be implemented:
- Editing metadata
- Photo enhancement or modification

### Mobile-friendly
As I'm mostly using my phone for image handling, this is also where most of the effort is concentrated.

## Usage
Your first session in the grid:
- The grid is sorted newest first and shows all photos by default. Pinch or use **Options** to change how many photos appear per row - the available zoom levels depend on your viewport width.
- Tap any photo to open it full screen in the PhotoSlider.
- Swipe left or right to switch photo, swipe up to show details for the current photo and swipe down to close the slider.
- Click the DatePicker in the top right to display a list of all known photo dates. Click on a date to go to that date in the grid. **Note:** List of dates is scrollable.
- Click on Options to get a list of zooming, sorting and filtering options, including favorites and photo/video type filters.
- Photos that are marked as trash are not deleted on server, only tagged for deletion at a later, optional stage. They will only be shown in the trash album.

## Future ideas
- Check integrity of photos on-demand or batched
- Virtual albums
- Global search for photo content, place taken, text content or people
- Map view
- Login
- Facial recognition
