import type { ObjectId } from "mongodb";

export const transformationStatuses = [
  "staging",
  "ready",
  "submitting",
  "queued",
  "processing",
  "saving_output",
  "completed",
  "failed",
] as const;

export type TransformationStatus = (typeof transformationStatuses)[number];

export interface TransformationInput {
  uploadcareUuid: string;
  uploadcareUrl: string;
  cloudinaryPublicId?: string;
  cloudinaryUrl?: string;
  originalName: string;
  mimeType: string;
  bytes: number;
}

export interface TransformationProvider {
  name: "magic-hour";
  inputFilePath?: string;
  jobId?: string;
  rawStatus?: string;
  creditsCharged?: number;
}

export type ReadyTransformationInput = TransformationInput & {
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
};

export type ReadyTransformationProvider = Pick<
  TransformationProvider,
  "inputFilePath"
> & {
  inputFilePath: string;
};

export interface TransformationRequest {
  prompt: string;
  artStyle?: string;
  startSeconds?: number;
  endSeconds?: number;
  fpsResolution?: "HALF" | "FULL";
}

export interface TransformationOutput {
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
}

export interface TransformationError {
  stage: "upload" | "submission" | "processing" | "output";
  code?: string;
  message: string;
  retryable: boolean;
}

export interface TransformationDocument {
  _id?: ObjectId;
  ownerId: string;
  status: TransformationStatus;
  input: TransformationInput;
  provider: TransformationProvider;
  request?: TransformationRequest;
  output?: TransformationOutput;
  error?: TransformationError;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateReadyTransformationInput {
  ownerId: string;
  input: ReadyTransformationInput;
  provider: ReadyTransformationProvider;
}
