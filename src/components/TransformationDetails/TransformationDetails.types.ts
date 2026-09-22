import type {
  TransformationHistoryItem,
  TransformationHistoryStatus,
} from "@/components/TransformationHistory/TransformationHistory.types";

export interface TransformationDetailsProps {
  transformation: TransformationHistoryItem;
}

export interface TransformationImagePanelProps {
  label: string;
  description: string;
  url: string | null;
  emptyTitle: string;
  emptyDescription: string;
  linkLabel: string;
  fileName: string;
  fileMeta: string;
  isLoading?: boolean;
  isGenerated?: boolean;
}

export interface SourceImageListItemProps {
  url: string | null;
  fileName: string;
  fileMeta: string;
  onPreview: () => void;
}

export interface TransformationProgressProps {
  status: TransformationHistoryStatus;
  errorStage?: "upload" | "submission" | "processing" | "output";
}
