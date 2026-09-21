export interface MagicHourWebhookHeaders {
  signature: string | null;
  timestamp: string | null;
}

export interface MagicHourVideoEventPayload {
  id: string;
  status: string;
  creditsCharged?: number;
}

export interface MagicHourVideoCompletedEventPayload
  extends MagicHourVideoEventPayload {
  downloads: Array<{ url: string }>;
}

export interface MagicHourVideoStartedEvent {
  type: "video.started";
  payload: MagicHourVideoEventPayload;
}

export interface MagicHourVideoCompletedEvent {
  type: "video.completed";
  payload: MagicHourVideoCompletedEventPayload;
}

export interface MagicHourVideoErroredEvent {
  type: "video.errored";
  payload: MagicHourVideoEventPayload;
}

export type MagicHourVideoEvent =
  | MagicHourVideoStartedEvent
  | MagicHourVideoCompletedEvent
  | MagicHourVideoErroredEvent;
