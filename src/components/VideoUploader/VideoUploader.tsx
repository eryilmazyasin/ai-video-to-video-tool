"use client";

import { FileUploaderRegular } from "@uploadcare/react-uploader/next";
import "@uploadcare/react-uploader/core.css";
import { useCallback, useRef, useState } from "react";

import TransformationForm from "@/components/TransformationForm/TransformationForm";
import type {
  PreparedSourceVideo,
  UploadApiResponse,
  UploadcareFailedEntry,
  UploadcareSuccessEntry,
  UploadcareUploadingEntry,
  UploadStage,
} from "@/components/VideoUploader/VideoUploader.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";

const maximumVideoSizeBytes = 50 * 1024 * 1024;
const videoAcceptTypes = "video/mp4,video/quicktime,.mp4,.mov";

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getUploadcareErrorMessage(entry: UploadcareFailedEntry) {
  const message = entry.errors[0]?.message;

  return message || "Uploadcare could not upload this video. Please try again.";
}

function isUploadApiResponse(value: unknown): value is UploadApiResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transformation = (value as Record<string, unknown>).transformation;

  if (!transformation || typeof transformation !== "object") {
    return false;
  }

  const sourceVideo = (transformation as Record<string, unknown>).sourceVideo;

  return Boolean(
    sourceVideo &&
      typeof sourceVideo === "object" &&
      typeof (transformation as Record<string, unknown>).id === "string" &&
      (transformation as Record<string, unknown>).status === "ready" &&
      typeof (sourceVideo as Record<string, unknown>).url === "string" &&
      typeof (sourceVideo as Record<string, unknown>).originalName === "string" &&
      typeof (sourceVideo as Record<string, unknown>).mimeType === "string" &&
      typeof (sourceVideo as Record<string, unknown>).bytes === "number",
  );
}

export default function VideoUploader() {
  const publicKey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;
  const completedUuidsRef = useRef(new Set<string>());
  const inFlightUuidRef = useRef<string | null>(null);
  const selectedUuidRef = useRef<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedEntry, setUploadedEntry] = useState<UploadcareSuccessEntry | null>(
    null,
  );
  const [sourceVideo, setSourceVideo] = useState<PreparedSourceVideo | null>(null);
  const [transformationId, setTransformationId] = useState<string | null>(null);

  const prepareSourceVideo = useCallback(async (entry: UploadcareSuccessEntry) => {
    const { uuid } = entry;

    if (completedUuidsRef.current.has(uuid) || inFlightUuidRef.current === uuid) {
      return;
    }

    // Keep each provider success event from starting duplicate preparation requests.
    inFlightUuidRef.current = uuid;
    selectedUuidRef.current = uuid;
    setStage("preparing");
    setError(null);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadcareUuid: uuid }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const apiError =
          body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
            ? (body as Record<string, string>).error
            : "The video could not be prepared. Please try again.";
        throw new Error(apiError);
      }

      if (!isUploadApiResponse(body)) {
        throw new Error("The video was prepared, but the server response was incomplete.");
      }

      completedUuidsRef.current.add(uuid);

      if (selectedUuidRef.current === uuid) {
        setSourceVideo(body.transformation.sourceVideo);
        setTransformationId(body.transformation.id);
        setStage("ready");
        window.dispatchEvent(new Event(transformationHistoryRefreshEvent));
      }
    } catch (requestError) {
      if (selectedUuidRef.current === uuid) {
        setStage("error");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The video could not be prepared. Please try again.",
        );
      }
    } finally {
      if (inFlightUuidRef.current === uuid) {
        inFlightUuidRef.current = null;
      }
    }
  }, []);

  const handleFileAdded = useCallback(() => {
    selectedUuidRef.current = null;
    setStage("idle");
    setProgress(0);
    setError(null);
    setUploadedEntry(null);
    setSourceVideo(null);
    setTransformationId(null);
  }, []);

  const handleUploadStart = useCallback(() => {
    setStage("uploading");
    setProgress(0);
    setError(null);
  }, []);

  const handleUploadProgress = useCallback((entry: UploadcareUploadingEntry) => {
    setProgress(Math.round(Math.min(100, Math.max(0, entry.uploadProgress))));
  }, []);

  const handleUploadSuccess = useCallback(
    (entry: UploadcareSuccessEntry) => {
      setUploadedEntry(entry);
      setProgress(100);
      void prepareSourceVideo(entry);
    },
    [prepareSourceVideo],
  );

  const handleUploadFailed = useCallback((entry: UploadcareFailedEntry) => {
    setStage("error");
    setError(getUploadcareErrorMessage(entry));
  }, []);

  const retryPreparation = useCallback(() => {
    if (uploadedEntry) {
      void prepareSourceVideo(uploadedEntry);
    }
  }, [prepareSourceVideo, uploadedEntry]);

  if (!publicKey) {
    return (
      <section
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left text-amber-950 shadow-sm"
        aria-labelledby="uploadcare-setup-title"
      >
        <h2 id="uploadcare-setup-title" className="font-semibold">
          Upload is not configured yet
        </h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Add <code className="rounded bg-amber-100 px-1 py-0.5">NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY</code> to your local environment, then restart the app.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-950/5 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-700">Source video</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Upload a video to begin
          </h2>
        </div>
        <span className="w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          MP4 or MOV · up to 50 MB
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Your video uploads directly to Uploadcare, then is copied to secure storage for the next transformation step.
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-3 sm:p-4">
        <FileUploaderRegular
          pubkey={publicKey}
          multiple={false}
          multipleMax={1}
          accept={videoAcceptTypes}
          maxLocalFileSizeBytes={maximumVideoSizeBytes}
          sourceList="local"
          className="block"
          onFileAdded={handleFileAdded}
          onFileUploadStart={handleUploadStart}
          onFileUploadProgress={handleUploadProgress}
          onFileUploadSuccess={handleUploadSuccess}
          onFileUploadFailed={handleUploadFailed}
        />
      </div>

      {stage === "uploading" && (
        <div className="mt-5" aria-live="polite">
          <div className="flex items-center justify-between text-sm font-medium text-zinc-800">
            <span>Uploading to Uploadcare</span>
            <span>{progress}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200"
            role="progressbar"
            aria-label="Uploadcare upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-full bg-violet-600 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {stage === "preparing" && (
        <p className="mt-5 flex items-center gap-2 text-sm font-medium text-zinc-800" role="status">
          <span className="size-2 animate-pulse rounded-full bg-violet-600" aria-hidden="true" />
          Upload complete. Preparing your video in secure storage…
        </p>
      )}

      {stage === "error" && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">{error}</p>
          {uploadedEntry && (
            <button
              type="button"
              onClick={retryPreparation}
              className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              Retry preparation
            </button>
          )}
        </div>
      )}

      {stage === "ready" && sourceVideo && (
        <>
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" aria-live="polite">
            <p className="text-sm font-semibold text-emerald-900">Video ready for transformation</p>
            <video
              className="mt-4 aspect-video w-full rounded-xl bg-zinc-950 object-contain"
              controls
              preload="metadata"
              src={sourceVideo.url}
            >
              Your browser does not support video preview.
            </video>
            <dl className="mt-4 grid gap-3 text-sm text-emerald-950 sm:grid-cols-3">
              <div>
                <dt className="text-emerald-800">File</dt>
                <dd className="mt-1 truncate font-medium" title={sourceVideo.originalName}>
                  {sourceVideo.originalName}
                </dd>
              </div>
              <div>
                <dt className="text-emerald-800">Format</dt>
                <dd className="mt-1 font-medium">{sourceVideo.mimeType}</dd>
              </div>
              <div>
                <dt className="text-emerald-800">Size</dt>
                <dd className="mt-1 font-medium">{formatFileSize(sourceVideo.bytes)}</dd>
              </div>
            </dl>
          </div>
          {transformationId && <TransformationForm transformationId={transformationId} />}
        </>
      )}
    </section>
  );
}
