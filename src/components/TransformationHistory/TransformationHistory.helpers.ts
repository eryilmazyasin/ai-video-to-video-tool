import type {
  TransformationHistoryItem,
  TransformationHistoryResponse,
  TransformationHistoryStatus,
} from "@/components/TransformationHistory/TransformationHistory.types";

export function isTransformationHistoryResponse(
  value: unknown,
): value is TransformationHistoryResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transformations = (value as Record<string, unknown>).transformations;

  return Array.isArray(transformations) && transformations.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const itemRecord = item as Record<string, unknown>;
    const sourceImage = itemRecord.sourceImage;

    return (
      typeof itemRecord.id === "string" &&
      typeof itemRecord.status === "string" &&
      sourceImage !== null &&
      typeof sourceImage === "object"
    );
  });
}

export function getHistoryErrorMessage(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).error === "string"
  ) {
    return (value as Record<string, string>).error;
  }

  return "Your transformation history could not be loaded. Please try again.";
}

export function getProjectContext(transformation: TransformationHistoryItem) {
  return transformation.request?.model && transformation.request.model !== "default"
    ? transformation.request.model
    : "Image project";
}

export function getStatusClasses(status: TransformationHistoryStatus) {
  if (status === "failed") return "bg-rose-400 ring-rose-100";
  if (status === "completed") return "bg-emerald-500 ring-emerald-100";
  if (status === "queued") return "bg-amber-400 ring-amber-100";

  if (status === "ready" || status === "submitting" || status === "processing" || status === "saving_output") {
    return "bg-sky-400 ring-sky-100";
  }

  return "bg-slate-400 ring-slate-100";
}
