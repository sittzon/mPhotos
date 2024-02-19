using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

public class ImageHelper
{
    public static byte[] GenerateThumbnailBytes(byte[] imageData, int thumbnailWidth, int thumbnailHeight)
    {
        using (Image image = Image.Load(imageData)) {
            image.Mutate(x => x.Resize(thumbnailWidth, thumbnailHeight));
            
            using (MemoryStream ms = new MemoryStream()) {
                image.SaveAsJpeg(ms);
                return ms.ToArray();
            }
        }
    }
    public static (int Width, int Height) GetImageDimensions(byte[] imageData)
    {
        using (Image image = Image.Load(imageData)) {
            return (image.Width, image.Height);
        }
    }

    public static double GetAspectRatio(byte[] imageData)
    {
        (int width, int height) = GetImageDimensions(imageData);
        return (double)width / height;
    }
}
