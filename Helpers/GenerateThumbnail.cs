using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using System.Globalization;
using SixLabors.ImageSharp.Formats.Webp;

namespace mPhotos.Helpers
{
    public class ImageHelper
    {
        public static byte[] GenerateThumbnailBytes(Image image, int thumbnailWidth, int thumbnailHeight, string? filePath = null) {
            image.Mutate(x => x.Resize(thumbnailWidth, thumbnailHeight));
            var encoder = new WebpEncoder()
            {
                Quality = 50,
                Method = WebpEncodingMethod.Level3
            };
            
            if (filePath != null) {
                image.SaveAsWebp(filePath, encoder);
                return Array.Empty<byte>();
            } else {
                using (MemoryStream ms = new MemoryStream()) {
                    image.SaveAsWebp(ms, encoder);
                    return ms.ToArray();
                }
            }
        }
        public static byte[] GenerateThumbnailBytes(byte[] imageData, int thumbnailWidth, int thumbnailHeight, string? filePath = null)
        {
            using (Image image = Image.Load(imageData)) {
                return GenerateThumbnailBytes(image, thumbnailWidth, thumbnailHeight, filePath);
            }
        }
        public static (int Width, int Height) GetImageDimensions(Image image) {
            var orientation = image.Metadata.ExifProfile?.Values.FirstOrDefault(x => x.Tag == ExifTag.Orientation);
            if (orientation != null && 
                (orientation.ToString().ToLower().Contains("rotate 90") || 
                    orientation.ToString().ToLower().Contains("rotate 270"))) {
                return (image.Height, image.Width);
            } else {
                return (image.Width, image.Height);
            }
        }

        public static (int Width, int Height) GetImageDimensions(byte[] imageData)
        {
            using (Image image = Image.Load(imageData)) {
                return GetImageDimensions(image);
            }
        }

        public static double GetAspectRatio(byte[] imageData)
        {
            (int width, int height) = GetImageDimensions(imageData);
            return (double)width / height;
        }

        public static DateTime? GetDateTaken(Image image) {
            DateTime? dateTaken = null;
            var metaDate = image.Metadata.ExifProfile?.Values.FirstOrDefault(x => x.Tag == ExifTag.DateTimeOriginal);
            if (metaDate != null && 
                DateTime.TryParseExact(metaDate.ToString(), "yyyy:MM:dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime dateTakenValue)) {
                dateTaken = dateTakenValue;
            }
            return dateTaken;
        }
        public static DateTime? GetDateTaken(byte[] imageData)
        {
            DateTime? dateTaken = null;
            using (Image image = Image.Load(imageData)) {
                dateTaken = GetDateTaken(image);
            }
            return dateTaken;
        }
    }

     public enum ExifOrientations
    {
        Unknown = 0,
        TopLeft = 1,
        TopRight = 2,
        BottomRight = 3,
        BottomLeft = 4,
        LeftTop = 5,
        RightTop = 6,
        RightBottom = 7,
        LeftBottom = 8,
    }
}