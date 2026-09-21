import { NextResponse, type NextRequest } from "next/server";

import { getExistingAnonymousOwner } from "@/server/auth/anonymousOwner";
import { listRecentForOwner } from "@/server/db-actions/transformationActions";
import type {
  TransformationDocument,
  TransformationError,
} from "@/server/types/transformation.types";

export const runtime = "nodejs";

const historyLimit = 12;

function getSafeError(error: TransformationError) {
  const safeMessages: Record<string, string> = {
    source_video_unavailable: "The stored source video is unavailable.",
    provider_submission_failed: "The transformation could not be submitted. Please try again.",
    provider_processing_failed: "The transformation could not be completed.",
    output_copy_failed: "The generated video could not be saved. Retrying automatically.",
  };

  return {
    stage: error.stage,
    message:
      (error.code && safeMessages[error.code]) ??
      "The transformation could not be completed.",
    retryable: error.retryable,
  };
}

function serializeTransformation(transformation: TransformationDocument & { _id: NonNullable<TransformationDocument["_id"]> }) {
  const request = transformation.request;

  return {
    id: transformation._id.toHexString(),
    status: transformation.status,
    sourceVideo: {
      url: transformation.input.cloudinaryUrl ?? null,
      originalName: transformation.input.originalName,
      mimeType: transformation.input.mimeType,
      bytes: transformation.input.bytes,
    },
    request: request
      ? {
          name: request.name ?? null,
          startSeconds: request.startSeconds,
          endSeconds: request.endSeconds,
          fpsResolution: request.fpsResolution ?? null,
          style: {
            artStyle: request.style.artStyle,
            model: request.style.model ?? null,
            prompt: request.style.prompt ?? null,
            promptType: request.style.promptType ?? null,
            version: request.style.version ?? null,
          },
        }
      : null,
    output: transformation.output
      ? { url: transformation.output.cloudinaryUrl }
      : null,
    error: transformation.error ? getSafeError(transformation.error) : null,
    creditsCharged: transformation.provider.creditsCharged ?? null,
    createdAt: transformation.createdAt.toISOString(),
    updatedAt: transformation.updatedAt.toISOString(),
    completedAt: transformation.completedAt?.toISOString() ?? null,
  };
}

export async function GET(request: NextRequest) {
  const ownerId = getExistingAnonymousOwner(request);

  if (!ownerId) {
    return NextResponse.json({ transformations: [] });
  }

  try {
    const transformations = await listRecentForOwner(ownerId, historyLimit);

    return NextResponse.json({
      transformations: transformations.map(serializeTransformation),
    });
  } catch {
    return NextResponse.json(
      { error: "Your transformation history could not be loaded. Please try again." },
      { status: 500 },
    );
  }
}
