using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using mPhotos.Helpers;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class PhotosController : ControllerBase
{
    private static readonly string photosRoot = @"";
    private static readonly string thumbnailRoot = @"";
    private readonly ILogger<PhotosController> _logger;
    private readonly IMemoryCache _memoryCache;
    private readonly string _photosMetaCacheKey = "photosMeta";
    // private readonly string _thumbnailsCacheKey = "thumbnails";
    private readonly int _thumbnailSizeWidth = 300;
    private readonly string _mediumCacheKey = "medium";
    private readonly int _mediumSizeWidth = 2000;

    public PhotosController(ILogger<PhotosController> logger, IMemoryCache memoryCache)
    {
        _logger = logger;
        _memoryCache = memoryCache;

        // Check that thumbnail folder is not inside the photos root
        if (thumbnailRoot.Contains(photosRoot)) {
            throw new Exception("Thumbnail folder cannot be inside the photos root folder");
        }

        Task.Run(LoadPhotos);
    }

    public async void LoadPhotos() {
        // Get all photos info from disk
        var fileInfos = await GetFileInfosRecursively(photosRoot);
        // Only support jpg/jpeg for now
        fileInfos = fileInfos.Where(x => x.Extension.ToLower().Equals(".jpg") || x.Extension.ToLower().Equals(".jpeg"));
        
        // Read metadata from disk
        // If exists -> Compare and only add missing photos. TODO: Also remove photos that are not on disk
        // Else -> Add all photos from fileInfos
        var photoMetadata = new List<PhotoMeta>();
        if (System.IO.File.Exists(thumbnailRoot + "/metadata.json")) {
            photoMetadata = JsonSerializer.Deserialize<List<PhotoMeta>>(System.IO.File.ReadAllText(thumbnailRoot + "/metadata.json"));

            var fileInfoLocs = fileInfos.Select(x => x.FullName);
            var photoLocs = photoMetadata.Select(x => x.Location);

            var photosToIndex = fileInfoLocs.Except(photoLocs).ToList();
            fileInfos = fileInfos.Where(x => photosToIndex.Contains(x.FullName)).ToList();
        }

        if (!_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            foreach (var fileInfo in fileInfos) {
                var bytes = System.IO.File.ReadAllBytes(fileInfo.FullName);
                var photoMeta = new PhotoMeta
                    {
                        DateTaken = ImageHelper.GetDateTaken(bytes),
                        Guid = HashHelper.GetHashString(fileInfo.FullName),
                        Location = fileInfo.FullName,
                        Name = fileInfo.Name,
                        Width = ImageHelper.GetImageDimensions(bytes).Width,
                        Height = ImageHelper.GetImageDimensions(bytes).Height,
                        SizeKb = (int)(fileInfo.Length / 1024),
                    };
                photoMetadata = photoMetadata.Append(photoMeta).ToList();
                photoMetadata = photoMetadata.OrderBy(x => x.DateTaken).ToList();

                // Only generate thumbnail if not found on disk
                if (!System.IO.File.Exists(thumbnailRoot + "/" + photoMeta.Guid + ".jpg")) {
                    var aspectRatio = (double)photoMeta.Width / photoMeta.Height;

                    int w = _thumbnailSizeWidth;
                    int h = (int)(aspectRatio/w);
                    var photoBytes = ImageHelper.GenerateThumbnailBytes(bytes, w, h, thumbnailRoot + "/" + photoMeta.Guid + ".jpg");
                }

                // Write to metadata file and add to metadata cache
                System.IO.File.WriteAllText(thumbnailRoot + "/metadata.json", JsonSerializer.Serialize(photoMetadata));
                _memoryCache.Set(_photosMetaCacheKey, photoMetadata);
            }
            _memoryCache.Set(_photosMetaCacheKey, photoMetadata);
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
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            return photos.FirstOrDefault(x => x.Guid.Equals(guid)).Location;
        }
        
        return null;
    }

    [HttpGet]
    [Route("metadata")]
    public IEnumerable<PhotoMeta> Get()
    {
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            return photos.OrderBy(x => x.DateTaken).Reverse();
        }

        return Array.Empty<PhotoMeta>();
    }

    [HttpGet]
    [Route("{guid}")]
    public IActionResult GetPhoto(string guid)
    {
        var location = GuidToLocation(guid)?? null;
        if (location == null) {
            return NotFound();
        }
        var b = System.IO.File.ReadAllBytes(location);
        return File(b, "image/jpeg");
    }

    [HttpGet]
    [Route("{guid}/thumb")]
    [ResponseCache(VaryByHeader = "User-Agent", Duration = 3600)]
    public IActionResult GetThumbnail(string guid)
    {
        if (System.IO.File.Exists(thumbnailRoot + "/" + guid + ".jpg")) {
            var b = System.IO.File.ReadAllBytes(thumbnailRoot + "/" + guid + ".jpg");
            return File(b, "image/jpeg");
        }

        return NotFound();
    }

    // [HttpGet]
    // [Route("{guid}/medium")]
    // public IActionResult GetMedium(string guid)
    // {
    //     if (!_memoryCache.TryGetValue(_mediumCacheKey + guid, out byte[] photoBytes)) {
    //         return NotFound();
    //     }

    //     return File(photoBytes, "image/jpeg");
    // }

    // private async Task<byte[]> GenerateThumbnail(string guid, int w) {
    //     var location = GuidToLocation(guid)?? null;

    //     if (location == null) {
    //         return Array.Empty<byte>();
    //     }
    //     var b = System.IO.File.ReadAllBytes(location);
    //     var aspectRatio = ImageHelper.GetAspectRatio(b);
        
    //     int h = (int)(aspectRatio/w);
    //     return await Task.Run(() => ImageHelper.GenerateThumbnailBytes(b, w, h));
    // }
}