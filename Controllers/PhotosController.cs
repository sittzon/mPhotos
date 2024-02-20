using System.Data.SqlTypes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class PhotosController : ControllerBase
{
    private static readonly string photosRoot = @"";
    private readonly ILogger<PhotosController> _logger;
    private readonly IMemoryCache _memoryCache;
    private readonly string _photosMetaCacheKey = "photosMeta";
    private readonly string _thumbnailsCacheKey = "thumbnails";
    private readonly int _thumbnailSizeWidth = 300;
    private readonly string _mediumCacheKey = "medium";
    private readonly int _mediumSizeWidth = 2000;

    public PhotosController(ILogger<PhotosController> logger, IMemoryCache memoryCache)
    {
        _logger = logger;
        _memoryCache = memoryCache;

        Task.Run(LoadPhotos);
    }

    public async void LoadPhotos() {
        if (!_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            var fileInfos = await GetFileInfosRecursively(photosRoot);
            
            // Only support jpg/jpeg
            fileInfos = fileInfos.Where(x => x.Extension.ToLower().Equals(".jpg") || x.Extension.ToLower().Equals(".jpeg"));
            photos = new List<PhotoMeta>();
            foreach (var fileInfo in fileInfos) {
                var bytes = System.IO.File.ReadAllBytes(fileInfo.FullName);
                var photoMeta = new PhotoMeta
                    {
                        DateTaken = ImageHelper.GetDateTaken(bytes),
                        Guid = Guid.NewGuid().ToString(),
                        Location = fileInfo.FullName,
                        Name = fileInfo.Name,
                        Width = ImageHelper.GetImageDimensions(bytes).Width,
                        Height = ImageHelper.GetImageDimensions(bytes).Height,
                        SizeKb = (int)(fileInfo.Length / 1024),
                    };
                photos = photos.Append(photoMeta);
                photos = photos.OrderBy(x => x.DateTaken);

                var b = System.IO.File.ReadAllBytes(photoMeta.Location);
                var aspectRatio = ImageHelper.GetAspectRatio(b);
                
                int w = _thumbnailSizeWidth;
                int h = (int)(aspectRatio/w);
                var photoBytes = ImageHelper.GenerateThumbnailBytes(b, w, h);
                _memoryCache.Set(_thumbnailsCacheKey + photoMeta.Guid, photoBytes);

                w = _mediumSizeWidth;
                h = (int)(aspectRatio/w);
                photoBytes = ImageHelper.GenerateThumbnailBytes(b, w, h);
                _memoryCache.Set(_mediumCacheKey + photoMeta.Guid, photoBytes);

                _memoryCache.Set(_photosMetaCacheKey, photos);
            }
        }
    }

    private async Task<IEnumerable<FileInfo>> GetFileInfosRecursively(string directory) {
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
        } else {
            return null;
        }
    }

    [HttpGet]
    [Route("metadata")]
    public IEnumerable<PhotoMeta> Get()
    {
        if (_memoryCache.TryGetValue(_photosMetaCacheKey, out IEnumerable<PhotoMeta> photos)) {
            return photos.OrderBy(x => x.DateTaken);
        } else {
            return Array.Empty<PhotoMeta>();
        }
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
    public IActionResult GetThumbnail(string guid)
    {
        if (!_memoryCache.TryGetValue(_thumbnailsCacheKey + guid, out byte[] photoBytes)) {
            return NotFound();
        }

        return File(photoBytes, "image/jpeg");
    }

    [HttpGet]
    [Route("{guid}/medium")]
    public IActionResult GetMedium(string guid)
    {
        if (!_memoryCache.TryGetValue(_mediumCacheKey + guid, out byte[] photoBytes)) {
            return NotFound();
        }

        return File(photoBytes, "image/jpeg");
    }

    private async Task<byte[]> GenerateThumbnail(string guid, int w) {
        var location = GuidToLocation(guid)?? null;

        if (location == null) {
            return Array.Empty<byte>();
        }
        var b = System.IO.File.ReadAllBytes(location);
        var aspectRatio = ImageHelper.GetAspectRatio(b);
        
        int h = (int)(aspectRatio/w);
        return await Task.Run(() => ImageHelper.GenerateThumbnailBytes(b, w, h));
    }
}