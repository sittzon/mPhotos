using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SixLabors.ImageSharp;
using System.Text.Json;
using mPhotos.Helpers;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class PhotosController : ControllerBase
{
    private static readonly string metaDataFilename = thumbnailRoot + "/metadata.json";
    private static readonly string errorLogFilename = thumbnailRoot + "/errors.log";
    private readonly IMemoryCache _memoryCache;
    private readonly string _photosMetaCacheKey = "photosMeta";
    private readonly int _thumbnailSizeWidth = 300;

    public PhotosController(IMemoryCache memoryCache)
    {
        _memoryCache = memoryCache;

        // Check that thumbnail folder is not inside the photos root
        if (thumbnailRoot.Contains(photosRoot)) {
            throw new Exception("Thumbnail folder cannot be inside the photos root folder");
        }

        Task.Run(LoadPhotos);
    }

    public async void LoadPhotos() {
        // Only run once, if cache is empty
        // Disables multiple instances of LoadPhotos to run if site is reloaded, or accessed by multiple users
        if (!_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta>? _)) {
            // Get all original photos info from disk
            // Only support jpg/jpeg for now
            var originalPhotos = await GetFileInfosRecursively(photosRoot);
            originalPhotos = originalPhotos.Where(x => x.Extension.ToLower().Equals(".jpg") || x.Extension.ToLower().Equals(".jpeg"));

            // Read metadata file if exists
            // If exists -> Compare and only add missing photos. TODO: Also remove photos that are not on disk
            // Else -> Add all photos from fileInfos
            var photoMetadata = new List<PhotoMeta>();
            if (System.IO.File.Exists(metaDataFilename)) {
                photoMetadata = JsonSerializer.Deserialize<List<PhotoMeta>>(System.IO.File.ReadAllText(metaDataFilename));

                var originalPhotosLocs = originalPhotos.Select(x => x.FullName);
                var photoMetadataLocs = photoMetadata.Select(x => x.Location);
                var photosToIndex = originalPhotosLocs.Except(photoMetadataLocs).ToList();
                
                originalPhotos = originalPhotos.Where(x => photosToIndex.Contains(x.FullName)).ToList();
            }

            var i = 0;
            foreach (var fileInfo in originalPhotos) {
                try {
                    var bytes = System.IO.File.ReadAllBytes(fileInfo.FullName);
                    var image = Image.Load(bytes);
                    var (width, height) = ImageHelper.GetImageDimensions(image);
                    var photoMeta = new PhotoMeta
                        {
                            DateTaken = ImageHelper.GetDateTaken(image),
                            Guid = HashHelper.GetHashString(fileInfo.FullName),
                            Location = fileInfo.FullName,
                            Name = fileInfo.Name,
                            Width = width,
                            Height = height,
                            SizeKb = (int)(fileInfo.Length / 1024),
                        };
                    photoMetadata = photoMetadata.Append(photoMeta).ToList();
                    photoMetadata = photoMetadata.OrderBy(x => x.DateTaken).ToList();

                    // Only generate thumbnail if not found on disk
                    if (!System.IO.File.Exists(thumbnailRoot + "/" + photoMeta.Guid + ".jpg")) {
                        var aspectRatio = (double)photoMeta.Width / photoMeta.Height;

                        int w = _thumbnailSizeWidth;
                        int h = (int)(aspectRatio/w);
                        var photoBytes = ImageHelper.GenerateThumbnailBytes(image, w, h, thumbnailRoot + "/" + photoMeta.Guid + ".jpg");
                    }

                    // Write to metadata file and add to metadata cache
                    // Update cache every photo
                    _memoryCache.Set(_photosMetaCacheKey, photoMetadata);
                    // Only write to disk every 50th photo
                    i = (i + 1) % 50;
                    if (i.Equals(0)) {
                        System.IO.File.WriteAllText(metaDataFilename, JsonSerializer.Serialize(photoMetadata));
                    }
                } catch(Exception e) {
                    System.IO.File.AppendAllText(errorLogFilename, @$"Error loading photo: {fileInfo.FullName}. Exception:  {e} \n");
                } 
            }
            _memoryCache.Set(_photosMetaCacheKey, photoMetadata);
            System.IO.File.WriteAllText(metaDataFilename, JsonSerializer.Serialize(photoMetadata));
        }
    }

    private static async Task<IEnumerable<FileInfo>> GetFileInfosRecursively(string directory) {
        var fileInfos = new List<FileInfo>();
        // Exclude dotfiles
        var files = new DirectoryInfo(directory)
            .GetFiles()
            .Where(x => !x.Name.FirstOrDefault().Equals('.'));
        fileInfos.AddRange(files);

        var dirs = Directory.GetDirectories(directory);
        foreach (var dir in dirs) {
            if (Directory.Exists(dir)){
                fileInfos.AddRange(await GetFileInfosRecursively(dir));
            }
        }
        return fileInfos;
    }

    private string? GuidToLocation(string guid) {
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta>? photos)) {
            return photos?.FirstOrDefault(x => x.Guid.Equals(guid))?.Location ?? null;
        }
        
        return null;
    }

    [HttpGet]
    [Route("metadata")]
    public IEnumerable<PhotoMetaClient> Get()
    {
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta>? photos)) {
            return photos.Select(x => new PhotoMetaClient() {
                DateTaken = x.DateTaken,
                Guid = x.Guid,
                Name = x.Name,
                SizeKb = x.SizeKb,
                Width = x.Width,
                Height = x.Height,
            })
            .OrderBy(x => x.DateTaken).Reverse();
        }

        return Array.Empty<PhotoMetaClient>();
    }

    [HttpGet]
    [Route("{guid}")]
    public IActionResult GetPhoto(string guid)
    {
        var location = GuidToLocation(guid)?? null;
        if (location == null) {
            return NotFound();
        }
        if (!System.IO.File.Exists(location)) {
            return NotFound();
        }
        var b = System.IO.File.ReadAllBytes(location);
        return File(b, "image/jpeg");
    }

    [HttpGet]
    [Route("{guid}/thumb")]
    [ResponseCache(VaryByHeader = "User-Agent", Duration = 86400)]
    public IActionResult GetThumbnail(string guid)
    {        
        var fileName = thumbnailRoot + "/" + guid + ".jpg";
        if (!System.IO.File.Exists(fileName)) {
           return NotFound();
        }

        var b = System.IO.File.ReadAllBytes(fileName);
        return File(b, "image/jpeg");
    }
}