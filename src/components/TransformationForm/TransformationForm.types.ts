import type { imageToImageAspectRatios, imageToImageModels, imageToImageResolutions } from "@/shared/imageToImageOptions";

export interface TransformationFormProps { transformationId: string; onQueued?: (transformationId: string) => void; }
export interface TransformationFormValues { name: string; prompt: string; model: (typeof imageToImageModels)[number]; resolution: (typeof imageToImageResolutions)[number]; aspectRatio: (typeof imageToImageAspectRatios)[number]; imageCount: 1 | 4 | 9 | 16; }
