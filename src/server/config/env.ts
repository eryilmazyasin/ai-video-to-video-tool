import { z } from "zod";

const requiredString = z.string().trim().min(1);
const appUrl = z.url();

function getRequiredEnvValue(name: string) {
  // Read values only when a service needs them, so unrelated routes can still build.
  const result = requiredString.safeParse(process.env[name]);

  if (!result.success) {
    throw new Error(
      `Missing or invalid environment variable: ${name}. Add it to .env.local.`,
    );
  }

  return result.data;
}

export function getMongoEnv() {
  return {
    uri: getRequiredEnvValue("MONGODB_URI"),
    databaseName: getRequiredEnvValue("MONGODB_DB_NAME"),
  };
}

export function getCloudinaryEnv() {
  return {
    cloudName: getRequiredEnvValue("CLOUDINARY_CLOUD_NAME"),
    apiKey: getRequiredEnvValue("CLOUDINARY_API_KEY"),
    apiSecret: getRequiredEnvValue("CLOUDINARY_API_SECRET"),
  };
}

export function getUploadcareEnv() {
  return {
    publicKey: getRequiredEnvValue("NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY"),
    secretKey: getRequiredEnvValue("UPLOADCARE_SECRET_KEY"),
  };
}

export function getMagicHourApiEnv() {
  return {
    apiKey: getRequiredEnvValue("MAGIC_HOUR_API_KEY"),
  };
}

export function getMagicHourWebhookEnv() {
  return {
    webhookSecret: getRequiredEnvValue("MAGIC_HOUR_WEBHOOK_SECRET"),
  };
}

export function getAppEnv() {
  const url = getRequiredEnvValue("APP_URL");
  const result = appUrl.safeParse(url);

  if (!result.success) {
    throw new Error("APP_URL must be a valid absolute URL. Add it to .env.local.");
  }

  return { url: result.data };
}
