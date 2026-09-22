import type {
  V1AiImageEditorCreateBodyAspectRatioEnum,
  V1AiImageEditorCreateBodyModelEnum,
  V1AiImageEditorCreateBodyResolutionEnum,
} from "magic-hour/types";

export const imageToImageModels = [
  "default",
  "flux-2-klein",
  "gpt-image-2",
  "gpt-image-2.5-flare",
  "krea-2",
  "nano-banana",
  "nano-banana-2",
  "nano-banana-2-lite",
  "nano-banana-pro",
  "qwen-edit",
  "seedream-v4",
  "seedream-v4.5",
  "seedream-v5-pro",
] as const satisfies readonly V1AiImageEditorCreateBodyModelEnum[];

export const imageToImageResolutions = ["640px", "1k", "2k", "4k"] as const satisfies readonly V1AiImageEditorCreateBodyResolutionEnum[];

export const imageToImageModelResolutions: Record<
  Exclude<(typeof imageToImageModels)[number], "default">,
  readonly (typeof imageToImageResolutions)[number][]
> = {
  "flux-2-klein": ["640px", "1k", "2k"],
  "gpt-image-2": ["640px", "1k", "2k", "4k"],
  "gpt-image-2.5-flare": ["640px", "1k", "2k", "4k"],
  "krea-2": ["640px", "1k"],
  "nano-banana": ["640px", "1k"],
  "nano-banana-2": ["640px", "1k", "2k", "4k"],
  "nano-banana-2-lite": ["640px", "1k"],
  "nano-banana-pro": ["1k", "2k", "4k"],
  "qwen-edit": ["640px", "1k", "2k"],
  "seedream-v4": ["640px", "1k", "2k", "4k"],
  "seedream-v4.5": ["640px", "1k", "2k", "4k"],
  "seedream-v5-pro": ["640px", "1k", "2k"],
};

export const imageToImageOutputCounts = [1, 4, 9, 16] as const;

export function getImageToImageResolutions(model: (typeof imageToImageModels)[number]) {
  // The provider may change its default model, so only offer a conservative fixed size.
  return model === "default" ? (["1k"] as const) : imageToImageModelResolutions[model];
}

export const imageToImageAspectRatios = [
  "auto",
  "1:1",
  "4:3",
  "3:2",
  "4:5",
  "2:3",
  "16:9",
  "9:16",
] as const satisfies readonly V1AiImageEditorCreateBodyAspectRatioEnum[];
