"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  TransformationCardProps,
  TransformationHistoryItem,
  TransformationHistoryRequest,
  TransformationHistoryResponse,
  TransformationHistoryStatus,
} from "@/components/TransformationHistory/TransformationHistory.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";

const historyPollIntervalMilliseconds = 4_500;

const automaticallyUpdatedStatuses = new Set<TransformationHistoryStatus>([
  "submitting",
  "queued",
  "processing",
  "saving_output",
]);

const statusLabels: Record<TransformationHistoryStatus, string> = {
  staging: "Preparing source",
  ready: "Ready to transform",
  submitting: "Submitting",
  queued: "Queued",
  processing: "Processing",
  saving_output: "Saving result",
  completed: "Completed",
  failed: "Needs attention",
};

const statusClasses: Record<TransformationHistoryStatus, string> = {
  staging: "bg-zinc-100 text-zinc-700",
  ready: "bg-sky-100 text-sky-800",
  submitting: "bg-amber-100 text-amber-900",
  queued: "bg-violet-100 text-violet-900",
  processing: "bg-violet-100 text-violet-900",
  saving_output: "bg-violet-100 text-violet-900",
  completed: "bg-emerald-100 text-emerald-900",
  failed: "bg-red-100 text-red-800",
};

function isTransformationHistoryResponse(
  value: unknown,
): value is TransformationHistoryResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transformations = (value as Record<string, unknown>).transformations;

  return Array.isArray(transformations) && transformations.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const itemRecord = item as Record<string, unknown>;
    const sourceVideo = itemRecord.sourceVideo;

    return (
      typeof itemRecord.id === "string" &&
      typeof itemRecord.status === "string" &&
      sourceVideo !== null &&
      typeof sourceVideo === "object"
    );
  });
}

function getErrorMessage(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).error === "string"
  ) {
    return (value as Record<string, string>).error;
  }

  return "Your transformation history could not be loaded. Please try again.";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string) {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getPromptTypeLabel(
  promptType: TransformationHistoryRequest["style"]["promptType"],
) {
  if (promptType === "append_default") {
    return "Add to default";
  }

  if (promptType === "custom") {
    return "Custom prompt";
  }

  if (promptType === "default") {
    return "Default prompt";
  }

  return "Not specified";
}

function TransformationCard({ transformation }: TransformationCardProps) {
  const { request, sourceVideo } = transformation;

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-zinc-950" title={sourceVideo.originalName}>
            {request?.name || sourceVideo.originalName}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">Created {formatDate(transformation.createdAt)}</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[transformation.status]}`}>
          {statusLabels[transformation.status]}
        </span>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-zinc-900">Source video</h4>
          {sourceVideo.url ? (
            <>
              <video
                className="mt-3 aspect-video w-full rounded-xl bg-zinc-950 object-contain"
                controls
                preload="metadata"
                src={sourceVideo.url}
                aria-label={`Source video: ${sourceVideo.originalName}`}
              >
                Your browser does not support video preview.
              </video>
              <a
                className="mt-3 inline-flex text-sm font-semibold text-violet-700 underline underline-offset-4 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                href={sourceVideo.url}
                target="_blank"
                rel="noreferrer"
              >
                Open source video
              </a>
            </>
          ) : (
            <p className="mt-3 rounded-xl bg-zinc-100 p-3 text-sm text-zinc-600">
              Source preview is unavailable for this earlier record.
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-700">
            <div>
              <dt className="text-zinc-500">Format</dt>
              <dd className="mt-1 font-medium">{sourceVideo.mimeType}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Size</dt>
              <dd className="mt-1 font-medium">{formatFileSize(sourceVideo.bytes)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-zinc-900">Transformation</h4>
          {request ? (
            <dl className="mt-3 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Clip</dt>
                <dd className="mt-1 font-medium">{request.startSeconds}s – {request.endSeconds}s</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Frame rate</dt>
                <dd className="mt-1 font-medium">{request.fpsResolution ?? "Not specified"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Style</dt>
                <dd className="mt-1 font-medium">{request.style.artStyle}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Model</dt>
                <dd className="mt-1 font-medium">{request.style.model ?? "Not specified"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Prompt mode</dt>
                <dd className="mt-1 font-medium">{getPromptTypeLabel(request.style.promptType)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Version</dt>
                <dd className="mt-1 font-medium">{request.style.version ?? "Not specified"}</dd>
              </div>
              {request.style.prompt && (
                <div className="sm:col-span-2">
                  <dt className="text-zinc-500">Prompt</dt>
                  <dd className="mt-1 whitespace-pre-wrap font-medium">{request.style.prompt}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              This source video has not been submitted for transformation yet.
            </p>
          )}

          {transformation.output && (
            <div className="mt-5 border-t border-zinc-100 pt-5">
              <h4 className="text-sm font-semibold text-zinc-900">Generated video</h4>
              <video
                className="mt-3 aspect-video w-full rounded-xl bg-zinc-950 object-contain"
                controls
                preload="metadata"
                src={transformation.output.url}
                aria-label={`Generated video for ${sourceVideo.originalName}`}
              >
                Your browser does not support video preview.
              </video>
              <a
                className="mt-3 inline-flex text-sm font-semibold text-violet-700 underline underline-offset-4 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                href={transformation.output.url}
                target="_blank"
                rel="noreferrer"
              >
                Open generated video
              </a>
            </div>
          )}

          {transformation.error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
              <p className="font-semibold">{transformation.error.message}</p>
              {transformation.error.retryable && <p className="mt-1">We will keep trying automatically.</p>}
            </div>
          )}

          <p className="mt-5 text-xs text-zinc-500">
            Last updated {formatDate(transformation.updatedAt)}
            {transformation.creditsCharged !== null && ` · ${transformation.creditsCharged} credits charged`}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function TransformationHistory() {
  const [transformations, setTransformations] = useState<TransformationHistoryItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    const controller = new AbortController();
    const isInitialLoad = !hasLoadedRef.current;
    inFlightRef.current = true;
    abortControllerRef.current = controller;

    if (isMountedRef.current && !isInitialLoad) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch("/api/history", {
        signal: controller.signal,
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok || !isTransformationHistoryResponse(body)) {
        throw new Error(getErrorMessage(body));
      }

      if (isMountedRef.current) {
        setTransformations(body.transformations);
        setError(null);
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      if (isMountedRef.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Your transformation history could not be loaded. Please try again.",
        );
      }
    } finally {
      inFlightRef.current = false;

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      if (isMountedRef.current) {
        hasLoadedRef.current = true;
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const initialLoadTimeoutId = window.setTimeout(() => void loadHistory(), 0);
    const handleHistoryRefresh = () => void loadHistory();

    window.addEventListener(
      transformationHistoryRefreshEvent,
      handleHistoryRefresh,
    );

    return () => {
      isMountedRef.current = false;
      window.clearTimeout(initialLoadTimeoutId);
      window.removeEventListener(
        transformationHistoryRefreshEvent,
        handleHistoryRefresh,
      );
      abortControllerRef.current?.abort();
    };
  }, [loadHistory]);

  useEffect(() => {
    const hasActiveTransformation = transformations.some((transformation) =>
      automaticallyUpdatedStatuses.has(transformation.status),
    );

    if (!hasActiveTransformation) {
      return;
    }

    // Poll only while a provider job can still change its status.
    const timeoutId = window.setTimeout(
      () => void loadHistory(),
      historyPollIntervalMilliseconds,
    );

    return () => window.clearTimeout(timeoutId);
  }, [loadHistory, transformations]);

  return (
    <section className="mt-8" aria-labelledby="transformation-history-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-700">Your work</p>
          <h2 id="transformation-history-title" className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Transformation history
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Recent uploads and results update automatically while this page stays open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={isInitialLoading || isRefreshing}
          className="w-fit rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing…" : "Refresh history"}
        </button>
      </div>

      {isInitialLoading && (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600" role="status">
          Loading your transformation history…
        </div>
      )}

      {!isInitialLoading && error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {!isInitialLoading && transformations.length === 0 && !error && (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white p-5 text-sm leading-6 text-zinc-600">
          Your recent uploads and transformations will appear here.
        </div>
      )}

      {transformations.length > 0 && (
        <div className="mt-5 space-y-5" aria-live="polite">
          {transformations.map((transformation) => (
            <TransformationCard key={transformation.id} transformation={transformation} />
          ))}
        </div>
      )}
    </section>
  );
}
