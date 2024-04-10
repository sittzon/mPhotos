# mPhotos
Regret offloading your photos from your device, and not being able to enjoy them easily anymore? Wonder why Plex's photo feature is so atrocious? Ever wonder why all self-hosted photo management tools try too much, when all you want is to view your photos in a fast and beautiful way?

Those were my thoughts also. That's why I set out to create a self-hosted variant of Apple Photos, that can handle your whole archive of photos (at least >20 000 photos) with good speed, all while being light on the server and client. This is managed by a lot of caching and virtual rendering.

Note that this is a work in progress and is not feature complete as of now.

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
I'm not a designer. Take inspiration from Apple Photos. Mobile-friendly, swipeable and pinchable photos.

## Features
- Fast indexing: Indexes and generates thumbnails for about 1000 photos in 10 min on my old Mac Mini i7 2012, from a regular harddrive.
- Responsive layout. Performant viewing
- Light & Dark mode (!)

## Known bugs / issues / TODO
- Reverse sort does not work correctly
- Incorrect main date displayed after switch to virtual rendering
- During fast scrolling, all previous thumbnails tries to get fetched. Should implement abortcontroller or other solution
- Not full resolution when image is zoomed

## Future development
- Filter images based on criteria
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