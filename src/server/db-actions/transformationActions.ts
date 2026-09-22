import { ObjectId, type Collection, type WithId } from "mongodb";

import { getDatabase } from "@/server/db/mongodb";
import type {
  CompleteTransformationOutputInput,
  CreateReadyTransformationInput,
  TransformationDocument,
  TransformationError,
  TransformationRequest,
} from "@/server/types/transformation.types";

const collectionName = "transformations";
let indexInitializationPromise: Promise<void> | undefined;
const outputSaveLeaseDurationMilliseconds = 5 * 60 * 1_000;

async function initializeIndexes(
  collection: Collection<TransformationDocument>,
) {
  if (!indexInitializationPromise) {
    // Create indexes once per runtime instead of on every database action.
    indexInitializationPromise = Promise.all([
      // This matches the owner-scoped history query without scanning other users' records.
      collection.createIndex({ ownerId: 1, createdAt: -1 }),
      // Job IDs arrive later, so only populated values must be unique.
      collection.createIndex(
        { "provider.jobId": 1 },
        { unique: true, sparse: true },
      ),
    ]).then(() => undefined);
  }

  await indexInitializationPromise;
}

async function getTransformationCollection() {
  const database = await getDatabase();
  const collection = database.collection<TransformationDocument>(collectionName);

  await initializeIndexes(collection);

  return collection;
}

export async function createReadyTransformation(
  input: CreateReadyTransformationInput,
): Promise<WithId<TransformationDocument>> {
  const collection = await getTransformationCollection();
  const now = new Date();
  const document: TransformationDocument = {
    ownerId: input.ownerId,
    status: "ready",
    input: input.input,
    provider: {
      name: "magic-hour",
      inputFilePath: input.provider.inputFilePath,
    },
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

  return { ...document, _id: result.insertedId };
}

export async function findByIdForOwner(
  transformationId: string,
  ownerId: string,
) {
  if (!ObjectId.isValid(transformationId)) {
    return null;
  }

  const collection = await getTransformationCollection();

  return collection.findOne({
    _id: new ObjectId(transformationId),
    ownerId,
  });
}

export async function listRecentForOwner(ownerId: string, limit: number) {
  const collection = await getTransformationCollection();
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  return collection
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();
}

export async function claimForSubmission(
  transformationId: ObjectId,
  ownerId: string,
  request: TransformationRequest,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // This atomic check stops a double click from creating two provider jobs.
  return collection.findOneAndUpdate(
    { _id: transformationId, ownerId, status: "ready" },
    { $set: { status: "submitting", request, updatedAt: now } },
    { returnDocument: "after" },
  );
}

export async function markQueued(
  transformationId: ObjectId,
  input: {
    providerJobId: string;
    rawStatus?: string;
    creditsCharged?: number;
  },
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // Do not let a late failure overwrite a completed result.
  const providerFields = {
    "provider.jobId": input.providerJobId,
    ...(input.rawStatus ? { "provider.rawStatus": input.rawStatus } : {}),
    ...(input.creditsCharged !== undefined
      ? { "provider.creditsCharged": input.creditsCharged }
      : {}),
  };

  return collection.findOneAndUpdate(
    { _id: transformationId, status: "submitting" },
    {
      $set: {
        status: "queued",
        ...providerFields,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

export async function markFailed(
  transformationId: ObjectId,
  error: TransformationError,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  return collection.findOneAndUpdate(
    { _id: transformationId, status: { $ne: "completed" } },
    { $set: { status: "failed", error, updatedAt: now } },
    { returnDocument: "after" },
  );
}

export async function resetRetryableTransformation(
  transformationId: ObjectId,
  ownerId: string,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // Only provider submission or processing failures can safely be resubmitted.
  return collection.findOneAndUpdate(
    {
      _id: transformationId,
      ownerId,
      status: "failed",
      "error.retryable": true,
      "error.stage": { $in: ["submission", "processing"] },
    },
    {
      $set: { status: "ready", updatedAt: now },
      $unset: {
        error: "",
        "provider.jobId": "",
        "provider.rawStatus": "",
        "provider.creditsCharged": "",
        output: "",
        completedAt: "",
      },
    },
    { returnDocument: "after" },
  );
}

export async function findByProviderJobId(providerJobId: string) {
  const collection = await getTransformationCollection();

  return collection.findOne({ "provider.jobId": providerJobId });
}

export async function markProcessingByProviderJobId(
  providerJobId: string,
  rawStatus: string,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // A delayed started event must not move a completed transformation backwards.
  return collection.findOneAndUpdate(
    { "provider.jobId": providerJobId, status: "queued" },
    {
      $set: {
        status: "processing",
        "provider.rawStatus": rawStatus,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

export async function claimForOutputSave(
  providerJobId: string,
  input: { rawStatus: string; creditsCharged?: number },
) {
  const collection = await getTransformationCollection();
  const now = new Date();
  const staleOutputSaveBefore = new Date(
    now.getTime() - outputSaveLeaseDurationMilliseconds,
  );

  // Only one active delivery may copy the output; stale leases and retryable failures can recover.
  return collection.findOneAndUpdate(
    {
      "provider.jobId": providerJobId,
      $or: [
        { status: "queued" },
        { status: "processing" },
        {
          status: "failed",
          "error.stage": "output",
          "error.retryable": true,
        },
        { status: "saving_output", updatedAt: { $lt: staleOutputSaveBefore } },
      ],
    },
    {
      $set: {
        status: "saving_output",
        "provider.rawStatus": input.rawStatus,
        ...(input.creditsCharged !== undefined
          ? { "provider.creditsCharged": input.creditsCharged }
          : {}),
        updatedAt: now,
      },
      $unset: { error: "" },
    },
    { returnDocument: "after" },
  );
}

export async function markCompletedFromOutput(
  transformationId: ObjectId,
  output: CompleteTransformationOutputInput,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  return collection.findOneAndUpdate(
    { _id: transformationId, status: "saving_output" },
    {
      $set: {
        status: "completed",
        output: {
          cloudinaryPublicId: output.cloudinaryPublicId,
          cloudinaryUrl: output.cloudinaryUrl,
        },
        "provider.rawStatus": output.rawStatus,
        ...(output.creditsCharged !== undefined
          ? { "provider.creditsCharged": output.creditsCharged }
          : {}),
        completedAt: now,
        updatedAt: now,
      },
      $unset: { error: "" },
    },
    { returnDocument: "after" },
  );
}

export async function markOutputCopyFailed(
  transformationId: ObjectId,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  return collection.findOneAndUpdate(
    { _id: transformationId, status: "saving_output" },
    {
      $set: {
        status: "failed",
        error: {
          stage: "output",
          code: "output_copy_failed",
          message: "The generated video could not be saved. Retrying automatically.",
          retryable: true,
        },
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

export async function markProviderErrored(
  providerJobId: string,
  rawStatus: string,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // Provider error text is untrusted, so persist a fixed safe error instead.
  return collection.findOneAndUpdate(
    { "provider.jobId": providerJobId, status: { $in: ["queued", "processing"] } },
    {
      $set: {
        status: "failed",
        "provider.rawStatus": rawStatus,
        error: {
          stage: "processing",
          code: "provider_processing_failed",
          message: "The transformation could not be completed.",
          retryable: false,
        },
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}
