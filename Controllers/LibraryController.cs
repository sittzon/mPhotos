using Microsoft.AspNetCore.Mvc;

namespace mPhotos.Controllers;

[ApiController]
[Route("[controller]")]
public class LibraryController : ControllerBase
{
    private static readonly List<string> PhotoGuids = new List<string>()
    {
        "535e4538-e49e-45fd-bb34-c2f85c6cd82b", "6458f33e-8905-434f-a750-e0222fa7c2fa"
    };

    private readonly ILogger<LibraryController> _logger;

    public LibraryController(ILogger<LibraryController> logger)
    {
        _logger = logger;
    }

    [HttpGet]
    public LibraryMeta Get()
    {
        return new LibraryMeta
        {
            LatestIndexTime = DateTime.Now,
            TotalPhotosNo = PhotoGuids.Count,
            TotalSizeMb = 100
        };
    }
}
