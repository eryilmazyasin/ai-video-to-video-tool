export type TransformationHistoryStatus =
  | "staging"
  | "ready"
  | "submitting"
  | "queued"
  | "processing"
  | "saving_output"
  | "completed"
  | "failed";

export type TransformationHistoryFilter =
  | "all"
  | "active"
  | "completed"
  | "failed";

export interface TransformationHistoryRequest {
  name: string | null;
  aspectRatio: string | null;
  imageCount: number | null;
  resolution: string | null;
  model: string | null;
  style: { prompt: string };
}

export interface TransformationHistoryItem {
  id: string;
  status: TransformationHistoryStatus;
  sourceImage: {
    url: string | null;
    originalName: string;
    mimeType: string;
    bytes: number;
  };
  request: TransformationHistoryRequest | null;
  outputs: Array<{ url: string }>;
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

export interface TransformationHistoryProps {
  selectedTransformationId: string | null;
  isCreatingNew: boolean;
  onSelectTransformation: (transformation: TransformationHistoryItem) => void;
  onStartNewTransformation: () => void;
  onTransformationsChange: (transformations: TransformationHistoryItem[]) => void;
}

export interface StatusTooltip {
  label: string;
  left: number;
  status: TransformationHistoryStatus;
  top: number;
}
