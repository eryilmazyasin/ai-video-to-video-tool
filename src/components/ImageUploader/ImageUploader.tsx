"use client";

import { FileUploaderMinimal } from "@uploadcare/react-uploader/next";
import type { UploadCtxProvider } from "@uploadcare/file-uploader";
import "@uploadcare/react-uploader/core.css";
import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import Image from "next/image";

import TransformationForm from "@/components/TransformationForm/TransformationForm";
import type {
  PreparedSourceImage,
  UploadApiResponse,
  UploadcareFailedEntry,
  UploadcareSuccessEntry,
  UploadcareUploadingEntry,
  UploadStage,
  ImageUploaderProps,
} from "@/components/ImageUploader/ImageUploader.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";

const maximumImageSizeBytes = 20 * 1024 * 1024;
const imageAcceptTypes = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getUploadcareErrorMessage(entry: UploadcareFailedEntry) {
  const message = entry.errors[0]?.message;

  return message || "Uploadcare could not upload this image. Please try again.";
}

function isUploadApiResponse(value: unknown): value is UploadApiResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transformation = (value as Record<string, unknown>).transformation;

  if (!transformation || typeof transformation !== "object") {
    return false;
  }

  const sourceImage = (transformation as Record<string, unknown>).sourceImage;

  return Boolean(
    sourceImage &&
      typeof sourceImage === "object" &&
      typeof (transformation as Record<string, unknown>).id === "string" &&
      (transformation as Record<string, unknown>).status === "ready" &&
      typeof (sourceImage as Record<string, unknown>).url === "string" &&
      typeof (sourceImage as Record<string, unknown>).originalName === "string" &&
      typeof (sourceImage as Record<string, unknown>).mimeType === "string" &&
      typeof (sourceImage as Record<string, unknown>).bytes === "number",
  );
}

export default function ImageUploader({ onTransformationQueued }: ImageUploaderProps) {
  const publicKey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;
  const uploaderRef = useRef<UploadCtxProvider>(null);
  const completedUuidsRef = useRef(new Set<string>());
  const inFlightUuidRef = useRef<string | null>(null);
  const selectedUuidRef = useRef<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedEntry, setUploadedEntry] = useState<UploadcareSuccessEntry | null>(
    null,
  );
  const [sourceImage, setSourceImage] = useState<PreparedSourceImage | null>(null);
  const [transformationId, setTransformationId] = useState<string | null>(null);
  const [isDropSurfaceActive, setIsDropSurfaceActive] = useState(false);

  const prepareSourceImage = useCallback(async (entry: UploadcareSuccessEntry) => {
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
            : "The image could not be prepared. Please try again.";
        throw new Error(apiError);
      }

      if (!isUploadApiResponse(body)) {
        throw new Error("The image was prepared, but the server response was incomplete.");
      }

      completedUuidsRef.current.add(uuid);

      if (selectedUuidRef.current === uuid) {
        setSourceImage(body.transformation.sourceImage);
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
            : "The image could not be prepared. Please try again.",
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
    setSourceImage(null);
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
      void prepareSourceImage(entry);
    },
    [prepareSourceImage],
  );

  const handleUploadFailed = useCallback((entry: UploadcareFailedEntry) => {
    setStage("error");
    setError(getUploadcareErrorMessage(entry));
  }, []);

  const retryPreparation = useCallback(() => {
    if (uploadedEntry) {
      void prepareSourceImage(uploadedEntry);
    }
  }, [prepareSourceImage, uploadedEntry]);

  const replaceSourceImage = useCallback(() => {
    const uploaderApi = uploaderRef.current?.getAPI();

    uploaderApi?.removeAllFiles();
    selectedUuidRef.current = null;
    setStage("idle");
    setProgress(0);
    setError(null);
    setUploadedEntry(null);
    setSourceImage(null);
    setTransformationId(null);

    window.setTimeout(() => uploaderApi?.openSystemDialog(), 0);
  }, []);

  const openFileDialog = useCallback(() => {
    uploaderRef.current?.getAPI().openSystemDialog();
  }, []);

  const handleUploadSurfaceKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFileDialog();
    }
  }, [openFileDialog]);

  const handleUploadSurfaceDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropSurfaceActive(false);

    const file = event.dataTransfer.files.item(0);

    if (!file) {
      return;
    }

    const uploaderApi = uploaderRef.current?.getAPI();

    // Send dropped files through the same Uploadcare validation and upload flow.
    uploaderApi?.removeAllFiles();
    uploaderApi?.addFileFromObject(file);
  }, []);

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

  const isReady = stage === "ready" && sourceImage;
  const showUploader = stage === "idle" || (stage === "error" && !uploadedEntry);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60" aria-labelledby="source-image-title">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${isReady ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
              {isReady ? (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true">
                  <path d="m5.5 10 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : "1"}
            </span>
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-violet-700 uppercase">
                Step 1 · Source image
              </p>
              <h2 id="source-image-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                {isReady ? "Source ready" : "Add your source image"}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                {isReady
                  ? "Review the selected image, then configure its new visual direction."
                  : "Choose the image you want to transform. We’ll prepare a secure copy before generation."}
              </p>
            </div>
          </div>
          <span className="ml-12 w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:ml-0">
            JPEG, PNG or WebP · Max 20 MB
          </span>
        </div>

        <div className="min-h-52 p-5 sm:p-6">
          <div className={showUploader ? "block" : "hidden"}>
            <div
              className={`ai-upload-scene relative isolate min-h-60 cursor-pointer overflow-hidden rounded-2xl border border-dashed p-5 text-center transition sm:min-h-64 sm:p-7 ${isDropSurfaceActive ? "border-violet-300" : "border-violet-400/45 hover:border-violet-300/80"}`}
              role="button"
              tabIndex={0}
              aria-label="Choose a source image"
              onClick={openFileDialog}
              onKeyDown={handleUploadSurfaceKeyDown}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDropSurfaceActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDropSurfaceActive(false);
                }
              }}
              onDrop={handleUploadSurfaceDrop}
            >
              <svg viewBox="0 0 180 140" className="pointer-events-none absolute -left-5 top-1/2 h-40 w-52 -translate-y-1/2 text-violet-300/15" fill="none" aria-hidden="true">
                <rect x="18" y="31" width="90" height="63" rx="8" stroke="currentColor" strokeWidth="2" transform="rotate(-14 18 31)" />
                <circle cx="47" cy="49" r="6" stroke="currentColor" strokeWidth="2" />
                <path d="m31 80 23-22 16 14 12-11 18 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg viewBox="0 0 180 140" className="pointer-events-none absolute -right-5 top-1/2 h-40 w-52 -translate-y-1/2 text-fuchsia-300/15" fill="none" aria-hidden="true">
                <circle cx="129" cy="37" r="20" stroke="currentColor" strokeWidth="2" />
                <circle cx="71" cy="70" r="11" stroke="currentColor" strokeWidth="2" />
                <circle cx="137" cy="106" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="m83 65 27-19m-26 32 42 22m13-44 0 39" stroke="currentColor" strokeWidth="2" />
              </svg>
              <div className="relative z-10 flex min-h-48 flex-col items-center justify-center">
                <span className="ai-upload-icon flex size-16 items-center justify-center rounded-full text-violet-200 sm:size-18">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-8" aria-hidden="true">
                    <path d="M12 15V5m0 0L8.5 8.5M12 5l3.5 3.5M5 14.5v2A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="mt-4 text-base font-semibold tracking-tight text-slate-100 sm:text-lg">Drop your source image here</p>
                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400 sm:text-sm">Drag a JPEG, PNG or WebP image here, or click anywhere to choose a file.</p>
              </div>
              <FileUploaderMinimal
                apiRef={uploaderRef}
                pubkey={publicKey}
                multiple={false}
                multipleMax={1}
                accept={imageAcceptTypes}
                maxLocalFileSizeBytes={maximumImageSizeBytes}
                sourceList="local"
                className="uploadcare-dropzone uc-dark uc-radius-medium"
                localeDefinitionOverride={{
                  en: {
                    "choose-file": "Choose image",
                    "drop-file-here": "Drop your image here",
                    "drop-files-here": "Drop your images here",
                  },
                }}
                onFileAdded={handleFileAdded}
                onFileUploadStart={handleUploadStart}
                onFileUploadProgress={handleUploadProgress}
                onFileUploadSuccess={handleUploadSuccess}
                onFileUploadFailed={handleUploadFailed}
              />
            </div>
          </div>

          {stage === "uploading" && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">Uploading securely</p>
                  <p className="mt-1 text-xs text-slate-600">Keep this page open until the upload finishes.</p>
                </div>
                <span className="font-semibold tabular-nums text-violet-700">{progress}%</span>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100"
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" role="status" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true">
                    <path d="M16 10a6 6 0 1 1-1.75-4.25" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Preparing your source</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Upload complete. We’re copying the file to secure storage for transformation.</p>
                </div>
              </div>
            </div>
          )}

          {stage === "error" && (
            <div className={`${showUploader ? "mt-4" : ""} rounded-xl border border-rose-200 bg-rose-50 p-4`} role="alert">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">!</span>
                <div>
                  <p className="text-sm font-semibold text-rose-950">We couldn’t prepare this image</p>
                  <p className="mt-1 text-sm leading-6 text-rose-800">{error}</p>
                  {uploadedEntry && (
                    <button
                      type="button"
                      onClick={retryPreparation}
                      className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
                    >
                      Try preparation again
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {isReady && (
            <div className="grid grid-cols-[minmax(0,8rem)_1fr] gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-5" aria-live="polite">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-950 shadow-sm"><Image fill sizes="(max-width: 640px) 50vw, 30vw" src={sourceImage.url} alt={`Source image: ${sourceImage.originalName}`} className="object-contain" /></div>
              <div className="flex min-w-0 flex-col justify-center">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  Ready to configure
                </span>
                <p className="mt-3 truncate text-base font-semibold text-slate-950" title={sourceImage.originalName}>
                  {sourceImage.originalName}
                </p>
                <dl className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <div className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                    <dt className="sr-only">Format</dt>
                    <dd>{sourceImage.mimeType.split("/")[1]?.toUpperCase() ?? "Image"}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                    <dt className="sr-only">File size</dt>
                    <dd>{formatFileSize(sourceImage.bytes)}</dd>
                  </div>
                </dl>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true">
                    <path d="M6.5 9V6.75a3.5 3.5 0 0 1 7 0V9M5.5 9h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" strokeLinecap="round" />
                  </svg>
                  Stored securely and ready to send to the transformation service.
                </p>
                <button
                  type="button"
                  onClick={replaceSourceImage}
                  className="mt-4 w-fit rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                >
                  Replace image
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {isReady && transformationId && (
        <TransformationForm transformationId={transformationId} onQueued={onTransformationQueued} />
      )}
    </>
  );
}
