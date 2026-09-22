import type {
  VideoToVideoArtStyle,
  VideoToVideoModel,
  VideoToVideoPromptType,
  VideoToVideoVersion,
} from "@/shared/videoToVideoOptions";

export interface TransformationFormProps {
  transformationId: string;
}

export interface TransformationFormValues {
  name: string;
  startSeconds: string;
  endSeconds: string;
  fpsResolution: "FULL" | "HALF";
  artStyle: VideoToVideoArtStyle;
  model: VideoToVideoModel;
  promptType: VideoToVideoPromptType;
  prompt: string;
  version: VideoToVideoVersion;
}

export type TransformationFormField =
  | "name"
  | "startSeconds"
  | "endSeconds"
  | "prompt";

export type TransformationFormErrors = Partial<
  Record<TransformationFormField, string>
>;

export interface TransformationApiResponse {
  transformation: {
    id: string;
    status: "queued";
  };
}
