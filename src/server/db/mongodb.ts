import { MongoClient, ServerApiVersion, type Db } from "mongodb";

import { getMongoEnv } from "@/server/config/env";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

function getMongoClientPromise() {
  if (!globalThis.mongoClientPromise) {
    const { uri } = getMongoEnv();
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    // Reuse one connection during reloads and warm serverless requests.
    globalThis.mongoClientPromise = client.connect();
  }

  return globalThis.mongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  const [{ databaseName }, client] = await Promise.all([
    Promise.resolve(getMongoEnv()),
    getMongoClientPromise(),
  ]);

  return client.db(databaseName);
}
