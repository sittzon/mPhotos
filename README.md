# mPhotos
mPhotos makes your local photo collection available as a lightning fast virtual grid in a self-hosted web application.

## Installation
### Docker
Map your originals and thumbnails directories in docker-compose.yml under **volumes:** and then run:
- `docker-compose up -d`

### Local
Specify your originals directory and where you would like your thumbnails to be created in a new file **.env**.
- *ORIGINAL_PHOTOS* - Originals directory (string), defaults to '/originals'
- *GENERATED_THUMBNAILS* - Thumbnail directory (string), defaults to '/thumbs' (will be created recursively if not present)

*Optional:* Use *THUMBNAIL_SIZE and *MEDIUM_SIZE* (int) variables to tweak size of thumbnails and images used in PhotoSlider. The *METADATA_FILE* and *ERRORS_FILE* (string) can also be specified, defaults to 'metadata.json' and 'errors.log';

Then run:
- `npm install`
- `npm run host`

## Development
Define variables in **.env** and then run:
- `brew install ffmpeg-full`
- `npm install`
- `npm run dev`

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
- Click the DatePicker in the top right to display a list of all known photo dates. Click on a date to go to that date in the grid. **Note:** List of dates is scrollable.
- Swipe down in the Photoslider to close. Swipe up to show details for current photo. Swipe left or right to switch photo.
- Click on Options to get a list of zooming, sorting and filtering options. Zoom levels (number of photos per row), depends on viewport width.
- Photos that are marked as trash are not deleted on server, only tagged for deletion at a later, optional stage. They will only be shown in the trash album.

## Future ideas
- Check integrity of photos on-demand or batched
- Virtual albums
- Global search for photo content, place taken, text content or people
- Map view
- Login
- Facial recognition