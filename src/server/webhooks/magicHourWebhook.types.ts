export interface MagicHourWebhookHeaders {
  signature: string | null;
  timestamp: string | null;
}

export interface MagicHourImageEventPayload {
  id: string;
  status: string;
  creditsCharged?: number;
}

export interface MagicHourImageCompletedEventPayload extends MagicHourImageEventPayload {
  downloads: Array<{ url: string }>;
}

export interface MagicHourImageStartedEvent {
  type: "image.started";
  payload: MagicHourImageEventPayload;
}

export interface MagicHourImageCompletedEvent {
  type: "image.completed";
  payload: MagicHourImageCompletedEventPayload;
}

export interface MagicHourImageErroredEvent {
  type: "image.errored";
  payload: MagicHourImageEventPayload;
}

export type MagicHourImageEvent = MagicHourImageStartedEvent | MagicHourImageCompletedEvent | MagicHourImageErroredEvent;
