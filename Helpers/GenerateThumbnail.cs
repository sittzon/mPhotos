using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using System.Globalization;

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
            var orientation = image.Metadata.ExifProfile?.Values.FirstOrDefault(x => x.Tag == ExifTag.Orientation);
            if (orientation != null && orientation.ToString().Equals("Horizontal (normal)")) {
                return (image.Width, image.Height);
            } else {
                return (image.Height, image.Width);
            }
        }
    }

    public static double GetAspectRatio(byte[] imageData)
    {
        (int width, int height) = GetImageDimensions(imageData);
        return (double)width / height;
    }

    public static DateTime? GetDateTaken(byte[] imageData)
    {
        DateTime? dateTaken = null;
        using (Image image = Image.Load(imageData)) {
            var metaDate = image.Metadata.ExifProfile?.Values.FirstOrDefault(x => x.Tag == ExifTag.DateTimeOriginal);
            if (metaDate != null && 
                DateTime.TryParseExact(metaDate.ToString(), "yyyy:MM:dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime dateTakenValue)) {
                dateTaken = dateTakenValue;
            }
        }
        return dateTaken;
    }
}
