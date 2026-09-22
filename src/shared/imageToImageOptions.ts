import type {
  V1AiImageEditorCreateBodyAspectRatioEnum,
  V1AiImageEditorCreateBodyModelEnum,
  V1AiImageEditorCreateBodyResolutionEnum,
} from "magic-hour/types";

export const imageToImageModels = [
  "flux-2-klein",
  "krea-2",
  "qwen-edit",
] as const satisfies readonly V1AiImageEditorCreateBodyModelEnum[];

export const imageToImageResolutions = ["640px", "1k", "2k"] as const satisfies readonly V1AiImageEditorCreateBodyResolutionEnum[];

export const imageToImageModelResolutions: Record<
  (typeof imageToImageModels)[number],
  readonly (typeof imageToImageResolutions)[number][]
> = {
  // Magic Hour documents these as free-tier options; account access can still vary.
  "flux-2-klein": ["640px", "1k", "2k"],
  "krea-2": ["640px", "1k"],
  "qwen-edit": ["640px", "1k", "2k"],
};

export const imageToImageOutputCounts = [1, 4, 9, 16] as const;

export function getImageToImageResolutions(model: (typeof imageToImageModels)[number]) {
  return imageToImageModelResolutions[model];
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
