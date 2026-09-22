export interface MagicHourImageCompletionInput {
  creditsCharged?: number;
  downloads: Array<{ url: string }>;
  providerJobId: string;
  rawStatus: string;
}

export type MagicHourImageCompletionResult =
  | "completed"
  | "ignored"
  | "invalid_output"
  | "output_save_failed"
  | "recording_failed";
