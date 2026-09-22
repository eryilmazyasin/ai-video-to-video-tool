const cloudinaryHost = "res.cloudinary.com";
const videoUploadPath = "/video/upload/";
const thumbnailTransformation =
  "c_fill,g_auto,h_96,q_auto,so_auto,w_96";

export function getCloudinaryVideoThumbnailUrl(videoUrl: string | null) {
  if (!videoUrl) {
    return null;
  }

  try {
    const url = new URL(videoUrl);

    if (url.protocol !== "https:" || url.hostname !== cloudinaryHost) {
      return null;
    }

    const uploadPathIndex = url.pathname.indexOf(videoUploadPath);

    if (uploadPathIndex === -1) {
      return null;
    }

    const assetPathStart = uploadPathIndex + videoUploadPath.length;
    const assetPath = url.pathname.slice(assetPathStart);
    const thumbnailAssetPath = assetPath.replace(/\.[^./]+$/, ".jpg");

    if (!assetPath || thumbnailAssetPath === assetPath) {
      return null;
    }

    // Cloudinary extracts a representative video frame as a small image.
    url.pathname = `${url.pathname.slice(0, assetPathStart)}${thumbnailTransformation}/${thumbnailAssetPath}`;

    return url.toString();
  } catch {
    return null;
  }
}
