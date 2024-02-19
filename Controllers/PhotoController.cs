using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class PhotoController : ControllerBase
{
    private static readonly string imgPath = @"";
    private readonly ILogger<PhotoController> _logger;
    private readonly IMemoryCache _memoryCache;
    private readonly string _photosMetaCacheKey = "photosMeta";
    private readonly string _thumbnailsCacheKey = "thumbnails";

    public PhotoController(ILogger<PhotoController> logger, IMemoryCache memoryCache)
    {
        _logger = logger;
        _memoryCache = memoryCache;

        if (!_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            var fileNames = GetFilenamesRecursively(imgPath);
            fileNames = fileNames.Where(x => x.ToLower().EndsWith("jpg") || x.ToLower().EndsWith("jpeg"));
            var _photosMeta = fileNames.Select(x => new PhotoMeta
                {
                    DateTaken = new FileInfo(x).LastWriteTimeUtc,
                    Guid = Guid.NewGuid().ToString(),
                    Location = x,
                    Name = x.Split('/').Last(),
                    SizeKb = (int)(new FileInfo(x).Length / 1024),
                }).ToList();

            _memoryCache.Set<IEnumerable<PhotoMeta>>(_photosMetaCacheKey, _photosMeta);
        }
    }

    IEnumerable<string> GetFilenamesRecursively(string directory) {
        var fileNames = new List<string>();
        var files = Directory.GetFiles(directory).ToList();
        // Add filenames, excluding dotfiles
        fileNames.AddRange(files.Where(x => !x.Split('/').Last().FirstOrDefault().Equals('.')));

        var dirs = Directory.GetDirectories(directory).ToList();
        foreach (var dir in dirs) {
            if (Directory.Exists(dir)){
                fileNames.AddRange(GetFilenamesRecursively(dir));
            }
        }
        return fileNames;
    }

    string? GuidToLocation(string guid) {
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
    public IActionResult GetPhoto(string guid)
    {
        var photo = imgPath + guid;
        var b = System.IO.File.ReadAllBytes(photo);
        return File(b, "image/jpeg");
    }

    [HttpGet]
    [Route("{guid}/thumb")]
    public IActionResult GetThumbnail(string guid)
    {
        if (!_memoryCache.TryGetValue(_thumbnailsCacheKey + guid, out byte[] photoBytes)) {
            var location = GuidToLocation(guid)?? null;
            if (location == null) {
                return NotFound();
            }
            _logger.LogDebug("guid: " + guid + " -> " + location);
            var b = System.IO.File.ReadAllBytes(location);
            var aspectRatio = ImageHelper.GetAspectRatio(b);
            
            int w = 300;
            int h = (int)(aspectRatio/w);
            photoBytes = ImageHelper.GenerateThumbnailBytes(b, w, h);
            _memoryCache.Set<byte[]>(_thumbnailsCacheKey + guid, photoBytes);
        }

        return File(photoBytes, "image/jpeg");
    }
}
