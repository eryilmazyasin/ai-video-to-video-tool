import type { TransformationHistoryItem } from "@/components/TransformationHistory/TransformationHistory.types";

export interface TransformationDetailsProps {
  transformation: TransformationHistoryItem;
}

export interface TransformationVideoPanelProps {
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
