import type { MagicHourImageProject } from "@/server/clients/magicHourClient.types";
import type { TransformationError } from "@/server/types/transformation.types";

const contentGuidelineIndicators = [
  "content policy",
  "copyright",
  "explicit",
  "guideline",
  "moderation",
  "sensitive",
  "safety",
] as const;

export const magicHourContentGuidelinesMessage = "Magic Hour could not generate this image because the source image or prompt may violate its content guidelines. Review the request and remove sensitive, explicit, or copyrighted material before trying again.";

export function getMagicHourProcessingError(
  providerError: MagicHourImageProject["error"],
): TransformationError {
  const providerReason = providerError
    ? `${providerError.code} ${providerError.message}`
      .toLowerCase()
      .replaceAll("_", " ")
    : "";
  const violatesContentGuidelines = contentGuidelineIndicators.some((indicator) =>
    providerReason.includes(indicator),
  );

  if (violatesContentGuidelines) {
    return {
      stage: "processing",
      code: "provider_content_guidelines",
      message: magicHourContentGuidelinesMessage,
      retryable: true,
    };
  }

  return {
    stage: "processing",
    code: "provider_processing_failed",
    message: "The transformation could not be completed.",
    retryable: false,
  };
}
