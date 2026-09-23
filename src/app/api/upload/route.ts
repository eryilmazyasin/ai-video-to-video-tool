import {
  getAnonymousOwner,
  setAnonymousOwnerCookie,
} from "@/server/auth/anonymousOwner";
import { uploadSourceImageFromUrl } from "@/server/clients/cloudinaryClient";
import { getUploadcareFileInfo } from "@/server/clients/uploadcareClient";
import { createReadyTransformation } from "@/server/db-actions/transformationActions";
import { uploadRequestSchema } from "@/server/schemas/transformationSchemas";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const supportedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maximumImageSizeBytes = 20 * 1024 * 1024;

function getValidationMessage(
  mimeType: string,
  sizeBytes: number,
  isReady: boolean,
) {
  if (!isReady) {
    return "The image upload is still being prepared. Please wait a moment and try again.";
  }

  if (!supportedMimeTypes.has(mimeType.toLowerCase())) {
    return "Only JPEG, PNG and WEBP image files are supported.";
  }

  if (sizeBytes > maximumImageSizeBytes) {
    return "The uploaded image must be 20 MB or smaller.";
  }

  return null;
}

export async function POST(request: NextRequest) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const input = uploadRequestSchema.safeParse(requestBody);

  if (!input.success) {
    return NextResponse.json(
      { error: "A valid Uploadcare file ID is required." },
      { status: 400 },
    );
  }

  let uploadcareFile;

  try {
    uploadcareFile = await getUploadcareFileInfo(input.data.uploadcareUuid);
  } catch {
    return NextResponse.json(
      { error: "The uploaded image could not be verified. Please try again." },
      { status: 502 },
    );
  }

  const validationMessage = getValidationMessage(
    uploadcareFile.mimeType,
    uploadcareFile.sizeBytes,
    uploadcareFile.isReady,
  );

  if (validationMessage) {
    return NextResponse.json({ error: validationMessage }, { status: 422 });
  }

  let cloudinaryImage;

  try {
    cloudinaryImage = await uploadSourceImageFromUrl({
      sourceUrl: uploadcareFile.cdnUrl,
      uploadcareUuid: uploadcareFile.uuid,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The image could not be copied to secure storage. Please try again.",
      },
      { status: 502 },
    );
  }

  const anonymousOwner = getAnonymousOwner(request);
  let transformation;

  try {
    transformation = await createReadyTransformation({
      ownerId: anonymousOwner.ownerId,
      input: {
        uploadcareUuid: uploadcareFile.uuid,
        uploadcareUrl: uploadcareFile.cdnUrl,
        cloudinaryPublicId: cloudinaryImage.publicId,
        cloudinaryUrl: cloudinaryImage.secureUrl,
        originalName: uploadcareFile.originalFilename,
        mimeType: uploadcareFile.mimeType,
        bytes: uploadcareFile.sizeBytes,
      },
      provider: {
        // Magic Hour reads this public HTTPS image URL during the next step.
        inputFilePath: cloudinaryImage.secureUrl,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The image was stored, but its transformation record could not be created.",
      },
      { status: 500 },
    );
  }

  const response = NextResponse.json(
    {
      transformation: {
        id: transformation._id.toHexString(),
        status: transformation.status,
        sourceImage: {
          url: cloudinaryImage.secureUrl,
          originalName: uploadcareFile.originalFilename,
          mimeType: uploadcareFile.mimeType,
          bytes: uploadcareFile.sizeBytes,
        },
      },
    },
    { status: 201 },
  );

  if (anonymousOwner.shouldSetCookie) {
    setAnonymousOwnerCookie(response, anonymousOwner.ownerId);
  }

  return response;
}
