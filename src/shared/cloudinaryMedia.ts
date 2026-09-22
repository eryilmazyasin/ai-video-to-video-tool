const cloudinaryHost = "res.cloudinary.com";
const imageUploadPath = "/image/upload/";
const thumbnailTransformation =
  "c_fill,g_auto,h_96,q_auto,w_96";

export function getCloudinaryImageThumbnailUrl(imageUrl: string | null) {
  if (!imageUrl) {
    return null;
  }

  try {
    const url = new URL(imageUrl);

    if (url.protocol !== "https:" || url.hostname !== cloudinaryHost) {
      return null;
    }

    const uploadPathIndex = url.pathname.indexOf(imageUploadPath);

    if (uploadPathIndex === -1) {
      return null;
    }

    const assetPathStart = uploadPathIndex + imageUploadPath.length;
    const assetPath = url.pathname.slice(assetPathStart);

    if (!assetPath) {
      return null;
    }

    // Cloudinary serves a small, cropped version of the uploaded image.
    url.pathname = `${url.pathname.slice(0, assetPathStart)}${thumbnailTransformation}/${assetPath}`;

    return url.toString();
  } catch {
    return null;
  }
}
