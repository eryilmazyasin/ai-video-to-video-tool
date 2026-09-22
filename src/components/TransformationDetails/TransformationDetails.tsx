"use client";

import { useState } from "react";

import TransformationForm from "@/components/TransformationForm/TransformationForm";
import type {
  TransformationDetailsProps,
  TransformationVideoPanelProps,
} from "@/components/TransformationDetails/TransformationDetails.types";
import type { TransformationHistoryStatus } from "@/components/TransformationHistory/TransformationHistory.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";

const statusLabels = {
  staging: "Preparing source",
  ready: "Ready to transform",
  submitting: "Submitting",
  queued: "Queued",
  processing: "Processing",
  saving_output: "Saving result",
  completed: "Completed",
  failed: "Needs attention",
} as const;

const statusClasses = {
  staging: "bg-slate-100 text-slate-600 ring-slate-200",
  ready: "bg-sky-50 text-sky-700 ring-sky-200",
  submitting: "bg-sky-50 text-sky-700 ring-sky-200",
  queued: "bg-amber-50 text-amber-700 ring-amber-200",
  processing: "bg-sky-50 text-sky-700 ring-sky-200",
  saving_output: "bg-sky-50 text-sky-700 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

const activeStatuses = new Set<TransformationHistoryStatus>([
  "staging",
  "submitting",
  "queued",
  "processing",
  "saving_output",
]);

const processingMessages: Partial<Record<TransformationHistoryStatus, string>> = {
  staging: "Your source video is being prepared for transformation.",
  submitting: "Sending your settings to the transformation service…",
  queued: "Your video is queued and will start processing shortly.",
  processing: "Your video is being transformed. This can take a few minutes.",
  saving_output: "The transformation is complete. Saving your generated video…",
};

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

function formatClip(startSeconds: number, endSeconds: number) {
  return `${startSeconds}s – ${endSeconds}s`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VideoPanel({
  label,
  description,
  url,
  emptyTitle,
  emptyDescription,
  linkLabel,
  fileName,
  fileMeta,
  isLoading = false,
  isGenerated = false,
}: TransformationVideoPanelProps) {
  return (
    <article className={`relative flex min-w-0 flex-col rounded-xl border p-4 ${isGenerated ? "overflow-hidden border-violet-400/50 bg-[radial-gradient(circle_at_78%_0%,rgba(168,85,247,0.2),transparent_38%),linear-gradient(145deg,rgba(36,23,70,0.95),rgba(18,18,32,0.98))] shadow-[0_16px_36px_rgb(76_29_149_/_24%)]" : "border-slate-200 bg-slate-50/60"}`}>
      {isGenerated && <span className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-fuchsia-500/15 blur-3xl" aria-hidden="true" />}
      <header className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{label}</h2>
          <p className="mt-1.5 text-xs text-slate-400">{description}</p>
        </div>
        {isGenerated && <span className="rounded-full border border-violet-300/40 bg-violet-500/15 px-2 py-1 text-[10px] font-semibold tracking-[0.1em] text-violet-200 uppercase">AI output</span>}
      </header>

      {url ? (
        <video className={`relative z-10 mt-4 aspect-video w-full rounded-lg bg-slate-950 object-contain shadow-sm ${isGenerated ? "ring-1 ring-violet-300/30 shadow-[0_12px_28px_rgb(0_0_0_/_34%)]" : ""}`} controls preload="metadata" src={url} aria-label={`${label} preview`}>
          Your browser does not support video preview.
        </video>
      ) : (
        <div className="relative z-10 mt-4 flex aspect-video min-h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-5 text-center">
          <div className="max-w-xs">
            <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
              {isLoading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600 motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8.5 7.5 12 10l-3.5 2.5v-5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </span>
            <p className="mt-3 text-sm font-medium text-slate-700">{emptyTitle}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{emptyDescription}</p>
          </div>
        </div>
      )}

      <footer className="relative z-10 mt-4 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-700" title={fileName}>{fileName}</p>
          <p className="mt-1 text-xs text-slate-400">{fileMeta}</p>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-violet-700 transition hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            {linkLabel}
          </a>
        )}
      </footer>
    </article>
  );
}

export default function TransformationDetails({
  transformation,
}: TransformationDetailsProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { request, sourceVideo } = transformation;
  const isActive = activeStatuses.has(transformation.status);
  const isCompleted = transformation.status === "completed";

  async function handleRetry() {
    setIsRetrying(true);
    setRetryError(null);

    try {
      const response = await fetch("/api/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transformationId: transformation.id }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
            ? (body as Record<string, string>).error
            : "The transformation could not be prepared for retry.";
        throw new Error(message);
      }

      window.dispatchEvent(new Event(transformationHistoryRefreshEvent));
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "The transformation could not be prepared for retry.");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60" aria-labelledby="transformation-details-title">
        <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-violet-700 uppercase">Project result</p>
            <h1 id="transformation-details-title" className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {request?.name || sourceVideo.originalName}
            </h1>
            <p className="mt-2 text-sm text-slate-400">Created {formatDate(transformation.createdAt)}</p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${statusClasses[transformation.status]}`}>
            <span className={`size-1.5 rounded-full bg-current ${isActive ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {statusLabels[transformation.status]}
          </span>
        </header>

        {isActive && (
          <div className="border-b border-violet-100 bg-violet-50/70 px-5 py-3.5 sm:px-6" role="status" aria-live="polite">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600 motion-reduce:animate-none" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-violet-950">Transformation in progress</p>
                <p className="mt-1 text-xs leading-5 text-violet-700">{processingMessages[transformation.status]} This view updates automatically.</p>
              </div>
            </div>
          </div>
        )}

        {transformation.error && (
          <div className="border-b border-rose-100 bg-rose-50/70 px-5 py-4 sm:px-6" role="alert">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-sm font-semibold text-rose-700">!</span>
              <div>
                <p className="text-sm font-semibold text-rose-950">This transformation needs attention</p>
                <p className="mt-1.5 text-sm leading-6 text-rose-800">{transformation.error.message}</p>
                {transformation.error.retryable && (
                  transformation.error.stage === "output" ? (
                    <p className="mt-2 text-xs text-rose-700">The generated video is safe. Saving it will retry automatically.</p>
                  ) : (
                    <button type="button" onClick={() => void handleRetry()} disabled={isRetrying} className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-rose-700 px-3 text-xs font-semibold text-white transition hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {isRetrying ? "Preparing retry…" : "Retry transformation"}
                    </button>
                  )
                )}
                {retryError && <p className="mt-2 text-xs text-rose-700">{retryError}</p>}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <VideoPanel
            label="Generated video"
            description="AI-transformed result"
            url={transformation.output?.url ?? null}
            emptyTitle={isActive ? "Creating your result" : "No generated video yet"}
            emptyDescription={isActive ? "You can leave this page while processing continues." : "The result will appear here after a successful transformation."}
            linkLabel="Open result"
            fileName={request?.name || "Generated result"}
            fileMeta={isCompleted ? `Completed ${formatDate(transformation.completedAt ?? transformation.updatedAt)}` : statusLabels[transformation.status]}
            isLoading={isActive}
            isGenerated
          />
          <VideoPanel
            label="Source video"
            description="Original upload"
            url={sourceVideo.url}
            emptyTitle="Preview unavailable"
            emptyDescription="The original file could not be previewed."
            linkLabel="Open source"
            fileName={sourceVideo.originalName}
            fileMeta={`${sourceVideo.mimeType === "video/quicktime" ? "MOV" : "MP4"} · ${formatFileSize(sourceVideo.bytes)}`}
          />
        </div>

        {request && (
          <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5 sm:px-6" aria-label="Transformation settings">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Transformation settings</h2>
                <p className="mt-1.5 text-xs text-slate-400">Configuration used for this generation.</p>
              </div>
              {transformation.creditsCharged !== null && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">{transformation.creditsCharged} credits</span>}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Clip</dt><dd className="mt-1.5 font-medium text-slate-700">{formatClip(request.startSeconds, request.endSeconds)}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Visual style</dt><dd className="mt-1.5 font-medium text-slate-700">{request.style.artStyle}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Frame rate</dt><dd className="mt-1.5 font-medium text-slate-700">{request.fpsResolution === "HALF" ? "Half" : request.fpsResolution === "FULL" ? "Full" : "Not specified"}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Model</dt><dd className="mt-1.5 font-medium text-slate-700">{request.style.model ?? "Provider default"}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Version</dt><dd className="mt-1.5 font-medium text-slate-700">{request.style.version?.toUpperCase() ?? "Provider default"}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Prompt mode</dt><dd className="mt-1.5 font-medium text-slate-700">{request.style.promptType?.replaceAll("_", " ") ?? "Default"}</dd></div>
              {request.style.prompt && <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2 lg:col-span-3"><dt className="text-xs text-slate-400">Creative prompt</dt><dd className="mt-1.5 leading-6 text-slate-600">{request.style.prompt}</dd></div>}
            </dl>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-400 sm:px-6">
          <span>Last updated {formatDate(transformation.updatedAt)}</span>
          {transformation.completedAt && <span>Completed {formatDate(transformation.completedAt)}</span>}
        </footer>
      </section>

      {transformation.status === "ready" && <TransformationForm transformationId={transformation.id} />}
    </>
  );
}
