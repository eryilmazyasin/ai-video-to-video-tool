import { NextResponse, type NextRequest } from "next/server";

import { getExistingAnonymousOwner } from "@/server/auth/anonymousOwner";
import { getMagicHourImageProject } from "@/server/clients/magicHourClient";
import {
  listRecentForOwner,
  markProcessingByProviderJobId,
  markProviderErrored,
} from "@/server/db-actions/transformationActions";
import type {
  TransformationDocument,
  TransformationError,
} from "@/server/types/transformation.types";
import { completeMagicHourImage } from "@/server/webhooks/magicHourImageCompletion";

export const runtime = "nodejs";

const historyLimit = 12;
const synchronizableStatuses = new Set(["queued", "processing", "saving_output"]);

function hasOnlyHttpsDownloads(downloads: Array<{ url: string }>) {
  try {
    return downloads.every((download) => new URL(download.url).protocol === "https:");
  } catch {
    return false;
  }
}

async function reconcileTransformation(transformation: TransformationDocument) {
  if (
    !synchronizableStatuses.has(transformation.status) ||
    !transformation.provider.jobId
  ) {
    return;
  }

  try {
    const project = await getMagicHourImageProject(transformation.provider.jobId);

    if (project.status === "rendering") {
      await markProcessingByProviderJobId(project.id, project.status);
      return;
    }

    if (project.status === "error") {
      await markProviderErrored(project.id, project.status);
      return;
    }

    if (project.status === "complete" && hasOnlyHttpsDownloads(project.downloads)) {
      await completeMagicHourImage({
        providerJobId: project.id,
        rawStatus: project.status,
        downloads: project.downloads.map((download) => ({ url: download.url })),
        creditsCharged: project.creditsCharged,
      });
    }
  } catch (error) {
    // Webhooks remain the primary path; a polling failure must not break history.
    console.error("Magic Hour image reconciliation failed.", {
      transformationId: transformation._id?.toHexString(),
      message: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
    });
  }
}

async function reconcileActiveTransformations(transformations: TransformationDocument[]) {
  await Promise.all(transformations.map(reconcileTransformation));
}

function getSafeError(error: TransformationError) {
  const safeMessages: Record<string, string> = {
    source_image_unavailable: "The stored source image is unavailable.",
    provider_submission_failed: "The transformation could not be submitted. Please try again.",
    insufficient_credits: "Not enough Magic Hour credits for these image settings.",
    plan_upgrade_required: "Your Magic Hour plan does not support these settings. Use a free-tier model at 640px or upgrade your plan.",
    invalid_image_settings: "Magic Hour rejected these settings. Try fewer results or a different model or resolution.",
    provider_processing_failed: "The transformation could not be completed.",
    output_copy_failed: "The generated image could not be saved. Retrying automatically.",
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
    sourceImage: {
      url: transformation.input.cloudinaryUrl ?? null,
      originalName: transformation.input.originalName,
      mimeType: transformation.input.mimeType,
      bytes: transformation.input.bytes,
    },
    request: request
      ? {
          name: request.name ?? null,
          aspectRatio: request.aspectRatio ?? null,
          imageCount: request.imageCount ?? null,
          resolution: request.resolution ?? null,
          model: request.model ?? null,
          style: {
            prompt: request.style.prompt,
          },
        }
      : null,
    outputs: (transformation.outputs ?? (transformation.output ? [transformation.output] : []))
      .map((output) => ({ url: output.cloudinaryUrl })),
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
    const initialTransformations = await listRecentForOwner(ownerId, historyLimit);

    // Reconcile active projects so a missed provider webhook is recoverable after refresh.
    await reconcileActiveTransformations(initialTransformations);
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
