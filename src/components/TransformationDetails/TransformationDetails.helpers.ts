import type { TransformationHistoryStatus } from "@/components/TransformationHistory/TransformationHistory.types";

export function getProgressStepIndex(
  status: TransformationHistoryStatus,
  errorStage?: "upload" | "submission" | "processing" | "output",
) {
  if (status === "staging" || status === "ready") return 0;
  if (status === "submitting" || status === "queued") return 1;
  if (status === "processing") return 2;
  if (status === "saving_output") return 3;
  if (status === "completed") return 4;

  if (errorStage === "submission") return 1;
  if (errorStage === "processing") return 2;
  if (errorStage === "output") return 3;

  return 0;
}
