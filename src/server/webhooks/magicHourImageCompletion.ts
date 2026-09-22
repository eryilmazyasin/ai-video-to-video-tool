import "server-only";

import { uploadOutputImageFromUrl } from "@/server/clients/cloudinaryClient";
import {
  claimForOutputSave,
  markCompletedFromOutput,
  markOutputCopyFailed,
} from "@/server/db-actions/transformationActions";
import type {
  MagicHourImageCompletionInput,
  MagicHourImageCompletionResult,
} from "@/server/webhooks/magicHourImageCompletion.types";

async function recordRetryableOutputFailure(
  transformationId: Parameters<typeof markOutputCopyFailed>[0],
) {
  try {
    await markOutputCopyFailed(transformationId);
  } catch {
    // The next reconciliation attempt can claim the retryable output failure.
  }
}

export async function completeMagicHourImage(
  input: MagicHourImageCompletionInput,
): Promise<MagicHourImageCompletionResult> {
  let claimedTransformation;

  try {
    claimedTransformation = await claimForOutputSave(input.providerJobId, {
      rawStatus: input.rawStatus,
      ...(input.creditsCharged !== undefined
        ? { creditsCharged: input.creditsCharged }
        : {}),
    });
  } catch {
    return "recording_failed";
  }

  if (!claimedTransformation) {
    return "ignored";
  }

  const expectedOutputCount = claimedTransformation.request?.imageCount ?? 1;

  if (input.downloads.length !== expectedOutputCount) {
    await recordRetryableOutputFailure(claimedTransformation._id);
    return "invalid_output";
  }

  let outputImages;

  try {
    // The output copy is intentionally inline so a missed webhook can be reconciled safely.
    const uploads = await Promise.allSettled(input.downloads.map((download, outputIndex) =>
      uploadOutputImageFromUrl({
        sourceUrl: download.url,
        providerJobId: input.providerJobId,
        outputIndex,
      }),
    ));

    if (uploads.some((upload) => upload.status === "rejected")) {
      throw new Error("At least one generated image could not be saved.");
    }

    outputImages = uploads.map((upload) => {
      if (upload.status !== "fulfilled") {
        throw new Error("Generated image upload failed.");
      }

      return upload.value;
    });
  } catch {
    await recordRetryableOutputFailure(claimedTransformation._id);
    return "output_save_failed";
  }

  try {
    const completedTransformation = await markCompletedFromOutput(
      claimedTransformation._id,
      {
        outputs: outputImages.map((image) => ({
          cloudinaryPublicId: image.publicId,
          cloudinaryUrl: image.secureUrl,
        })),
        rawStatus: input.rawStatus,
        ...(input.creditsCharged !== undefined
          ? { creditsCharged: input.creditsCharged }
          : {}),
      },
    );

    if (!completedTransformation) {
      return "recording_failed";
    }
  } catch {
    await recordRetryableOutputFailure(claimedTransformation._id);
    return "recording_failed";
  }

  return "completed";
}
