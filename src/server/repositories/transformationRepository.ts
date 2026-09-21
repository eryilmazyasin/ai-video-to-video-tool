import { ObjectId, type Collection, type WithId } from "mongodb";

import { getDatabase } from "@/server/db/mongodb";
import type {
  CreateReadyTransformationInput,
  TransformationDocument,
  TransformationError,
} from "@/server/types/transformation.types";

const collectionName = "transformations";
let indexInitializationPromise: Promise<void> | undefined;

async function initializeIndexes(
  collection: Collection<TransformationDocument>,
) {
  if (!indexInitializationPromise) {
    // Create indexes once per runtime instead of on every repository call.
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
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // This atomic check stops a double click from creating two provider jobs.
  return collection.findOneAndUpdate(
    { _id: transformationId, ownerId, status: "ready" },
    { $set: { status: "submitting", updatedAt: now } },
    { returnDocument: "after" },
  );
}

export async function markQueued(
  transformationId: ObjectId,
  providerJobId: string,
  rawStatus: string,
) {
  const collection = await getTransformationCollection();
  const now = new Date();

  // Do not let a late failure overwrite a completed result.
  return collection.findOneAndUpdate(
    { _id: transformationId, status: "submitting" },
    {
      $set: {
        status: "queued",
        "provider.jobId": providerJobId,
        "provider.rawStatus": rawStatus,
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
