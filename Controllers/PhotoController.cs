using Microsoft.AspNetCore.Mvc;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class PhotoController : ControllerBase
{
    private static readonly List<string> PhotoGuids = new List<string>()
    {
        "535e4538-e49e-45fd-bb34-c2f85c6cd82b", "6458f33e-8905-434f-a750-e0222fa7c2fa"
    };

    private readonly ILogger<PhotoController> _logger;

    public PhotoController(ILogger<PhotoController> logger)
    {
        _logger = logger;
    }

    [HttpGet]
    public IEnumerable<PhotoMeta> Get()
    {
        return PhotoGuids.Select(x => new PhotoMeta
        {
            // Date = DateTime.Now,
            Guid = x
            // Name = x
        }).ToArray();
    }
}
