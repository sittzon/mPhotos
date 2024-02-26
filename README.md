# mPhotos
Regret offloading your photos from your device, and not being able to enjoy them easily anymore? Wonder why Plex's photo feature is so atrocious? Ever wonder why all self-hosted photo management tools try too much, when all you want is to view your photos in a fast and beautiful way?

Those were my thoughts also. That's why I set out to create a self-hosted variant of Apple Photos, that can handle your whole archive of photos (at least >20 000 photos) with great speed, all while being light on the server and client. This is of course managed by a lot of caching, but is a fair tradeoff for speed, as your archive of images probably does not change so much. 

## Development Tl;DR
- `dotnet run/watch`
- goto: `https://localhost:7238`

## Design goals
### Independence
No uploading to the cloud, only self-hosting allowed. Trust the user to have their own backup solution.

### Performance
Able to view whole archive of photos in a huge grid with virtually no slowdown. Full-resolution photos on-demand. Thumbnails ~50kB.

### Simplicity
Easy to use, no editing of metadata, read-only archive. 

### Style
I'm not a designer. So why not use a design that has already been tested by billions of people? Take inspiration from Apple Photos. Mobile-friendly, swipeable and pinchable photos.

## Features
- Fast indexing: Indexes and generates thumbnails for about 1000 photos in 10 min on my old Mac Mini i7 2012, from a regular harddrive.
- Responsive layout. Performant viewing
- Light & Dark mode (!)

## Known bugs / issues
- Image width/height sometimes gets mixed up on metadata generation. Exif data can be tricky to interpret.
- Reverse sort does not work correctly in Chrome/Chromium

## Future development
- Filter images based on date
- Filter images
- Automatic re-indexing when new images are added to disk
- Support for image formats other than JPG
- Extended metadata viewing
- Select favorite photos
- Option to stream medium-resolution photos instead of full-resolution, to save bandwidth
- Video streaming support
- Check integrity of photos on-demand
- Virtual albums
- Search
- Login
- Perhaps facial recognition
- Perhaps map view