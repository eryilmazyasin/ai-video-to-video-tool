import type {
  V1AiImageEditorCreateBody,
  V1AiImageEditorCreateResponse,
  V1ImageProjectsGetResponse,
} from "magic-hour/types";

export type MagicHourImageToImageRequest = V1AiImageEditorCreateBody;
export type MagicHourImageToImageResponse = V1AiImageEditorCreateResponse;
export type MagicHourImageProject = V1ImageProjectsGetResponse;

export interface MagicHourAccountSummary {
  accountIdSuffix: string;
  credits: number;
  tier: "business" | "creator" | "free" | "pro";
}
