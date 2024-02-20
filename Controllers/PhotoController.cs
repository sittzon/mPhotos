using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class PhotoController : ControllerBase
{
    private static readonly string photosRoot = @"";
    private readonly ILogger<PhotoController> _logger;
    private readonly IMemoryCache _memoryCache;
    private readonly string _photosMetaCacheKey = "photosMeta";
    private readonly string _thumbnailsCacheKey = "thumbnails";
    private readonly int _thumbnailSizeWidth = 300;
    private readonly string _mediumCacheKey = "medium";
    private readonly int _mediumSizeWidth = 1600;

    public PhotoController(ILogger<PhotoController> logger, IMemoryCache memoryCache)
    {
        _logger = logger;
        _memoryCache = memoryCache;

        Task.Run(LoadPhotos);

        Task.Run(GenerateThumbnailsAndMediums);
    }

    private async void LoadPhotos() {
        if (!_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            var fileNames = await GetFilenamesRecursively(photosRoot);
            
            // Only support jpg/jpeg
            fileNames = fileNames.Where(x => x.ToLower().EndsWith("jpg") || x.ToLower().EndsWith("jpeg"));
            photos = fileNames.Select(x => (filename: x, fileinfo: new FileInfo(x))).Select(x => new PhotoMeta
                {
                    DateTaken = x.fileinfo.LastWriteTimeUtc,
                    Guid = Guid.NewGuid().ToString(),
                    Location = x.filename,
                    Name = x.fileinfo.Name,
                    SizeKb = (int)(x.fileinfo.Length / 1024),
                })
                .ToList()
                .OrderBy(x => x.DateTaken);

            _memoryCache.Set(_photosMetaCacheKey, photos);
        }
    }

    private async void GenerateThumbnailsAndMediums() {
        bool generated = false;
        while (!generated) {
            if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
                foreach (var photo in photos) {
                    var guid = photo.Guid;

                    if (!_memoryCache.TryGetValue(_thumbnailsCacheKey + guid, out byte[] photoBytes)) {
                        var location = await GuidToLocation(guid)?? null;
                        var b = System.IO.File.ReadAllBytes(location);
                        var aspectRatio = ImageHelper.GetAspectRatio(b);
                        
                        int w = _thumbnailSizeWidth;
                        int h = (int)(aspectRatio/w);
                        photoBytes = Task.Run(() => ImageHelper.GenerateThumbnailBytes(b, w, h)).Result;
                        _memoryCache.Set(_thumbnailsCacheKey + guid, photoBytes);

                        w = _mediumSizeWidth;
                        h = (int)(aspectRatio/w);
                        photoBytes = Task.Run(() => ImageHelper.GenerateThumbnailBytes(b, w, h)).Result;
                        _memoryCache.Set(_mediumCacheKey + guid, photoBytes);
                    }
                }
                generated = true;
            } else {
                await Task.Delay(1000);
            }
        }
    }

    private async Task<IEnumerable<string>> GetFilenamesRecursively(string directory) {
        var fileNames = new List<string>();
        var files = Directory.GetFiles(directory).ToList();
        // Add filenames, excluding dotfiles
        fileNames.AddRange(files.Where(x => !x.Split('/').Last().FirstOrDefault().Equals('.')));

        var dirs = Directory.GetDirectories(directory).ToList();
        foreach (var dir in dirs) {
            if (Directory.Exists(dir)){
                fileNames.AddRange(await GetFilenamesRecursively(dir));
            }
        }
        return fileNames;
    }

    private async Task<string?> GuidToLocation(string guid) {
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            return photos?.FirstOrDefault(x => x.Guid.Equals(guid))?.Location;
        } else {
            return null;
        }
    }

    [HttpGet]
    public IEnumerable<PhotoMeta> Get()
    {
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            return photos?.OrderBy(x => x.DateTaken);
        } else {
            return null;
        }
    }

    [HttpGet]
    [Route("{guid}")]
    public async Task<IActionResult> GetPhoto(string guid)
    {
        var location = await GuidToLocation(guid)?? null;
        if (location == null) {
            return NotFound();
        }
        _logger.LogDebug("guid: " + guid + " -> " + location);
        var b = System.IO.File.ReadAllBytes(location);
        return File(b, "image/jpeg");
    }

    [HttpGet]
    [Route("{guid}/thumb")]
    public async Task<IActionResult> GetThumbnail(string guid)
    {
        if (!_memoryCache.TryGetValue(_thumbnailsCacheKey + guid, out byte[] photoBytes)) {
            photoBytes = await GenerateThumbnail(guid, _thumbnailSizeWidth);
        }

        return File(photoBytes, "image/jpeg");
    }

    [HttpGet]
    [Route("{guid}/medium")]
    public async Task<IActionResult> GetMedium(string guid)
    {
        if (!_memoryCache.TryGetValue(_mediumCacheKey + guid, out byte[] photoBytes)) {
            photoBytes = await GenerateThumbnail(guid, _mediumSizeWidth);
        }

        return File(photoBytes, "image/jpeg");
    }

    private async Task<byte[]> GenerateThumbnail(string guid, int w) {
        var location = await GuidToLocation(guid)?? null;

        if (location == null) {
            return Array.Empty<byte>();
        }
        var b = System.IO.File.ReadAllBytes(location);
        var aspectRatio = ImageHelper.GetAspectRatio(b);
        
        int h = (int)(aspectRatio/w);
        return await Task.Run(() => ImageHelper.GenerateThumbnailBytes(b, w, h));
    }
}
