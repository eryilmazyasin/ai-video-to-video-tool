export type TransformationHistoryStatus =
  | "staging"
  | "ready"
  | "submitting"
  | "queued"
  | "processing"
  | "saving_output"
  | "completed"
  | "failed";

export interface TransformationHistoryRequest {
  name: string | null;
  startSeconds: number;
  endSeconds: number;
  fpsResolution: "FULL" | "HALF" | null;
  style: {
    artStyle: string;
    model: string | null;
    prompt: string | null;
    promptType: "append_default" | "custom" | "default" | null;
    version: "default" | "v1" | "v2" | null;
  };
}

export interface TransformationHistoryItem {
  id: string;
  status: TransformationHistoryStatus;
  sourceVideo: {
    url: string | null;
    originalName: string;
    mimeType: string;
    bytes: number;
  };
  request: TransformationHistoryRequest | null;
  output: { url: string } | null;
  error: {
    stage: "upload" | "submission" | "processing" | "output";
    message: string;
    retryable: boolean;
  } | null;
  creditsCharged: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TransformationHistoryResponse {
  transformations: TransformationHistoryItem[];
}

export interface TransformationCardProps {
  transformation: TransformationHistoryItem;
}
