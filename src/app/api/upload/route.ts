import { z } from "zod";

import { getAnonymousOwner, setAnonymousOwnerCookie } from "@/server/auth/anonymousOwner";
import { uploadSourceVideoFromUrl } from "@/server/clients/cloudinaryClient";
import { getUploadcareFileInfo } from "@/server/clients/uploadcareClient";
import { createReadyTransformation } from "@/server/db-actions/transformationActions";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const uploadRequestSchema = z
  .object({
    uploadcareUuid: z.string().trim().uuid(),
  })
  .strict();

const supportedMimeTypes = new Set(["video/mp4", "video/quicktime"]);
const maximumVideoSizeBytes = 50 * 1024 * 1024;

function getValidationMessage(mimeType: string, sizeBytes: number, isReady: boolean) {
  if (!isReady) {
    return "The video upload is still being prepared. Please wait a moment and try again.";
  }

  if (!supportedMimeTypes.has(mimeType.toLowerCase())) {
    return "Only MP4 and MOV video files are supported.";
  }

  if (sizeBytes > maximumVideoSizeBytes) {
    return "The video file must be 50 MB or smaller.";
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
      { error: "The uploaded video could not be verified. Please try again." },
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

  let cloudinaryVideo;

  try {
    cloudinaryVideo = await uploadSourceVideoFromUrl({
      sourceUrl: uploadcareFile.cdnUrl,
      uploadcareUuid: uploadcareFile.uuid,
    });
  } catch {
    return NextResponse.json(
      { error: "The video could not be copied to secure storage. Please try again." },
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
        cloudinaryPublicId: cloudinaryVideo.publicId,
        cloudinaryUrl: cloudinaryVideo.secureUrl,
        originalName: uploadcareFile.originalFilename,
        mimeType: uploadcareFile.mimeType,
        bytes: uploadcareFile.sizeBytes,
      },
      provider: {
        // Magic Hour can read this public HTTPS video URL during the next step.
        inputFilePath: cloudinaryVideo.secureUrl,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The video was stored, but its transformation record could not be created." },
      { status: 500 },
    );
  }

  const response = NextResponse.json(
    {
      transformation: {
        id: transformation._id.toHexString(),
        status: transformation.status,
        sourceVideo: {
          url: cloudinaryVideo.secureUrl,
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
