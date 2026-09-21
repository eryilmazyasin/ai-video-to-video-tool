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

export interface TransformationApiResponse {
  transformation: {
    id: string;
    status: "queued";
  };
}
