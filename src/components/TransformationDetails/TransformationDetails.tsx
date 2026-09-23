"use client";

import { useState } from "react";
import Image from "next/image";

import TransformationForm from "@/components/TransformationForm/TransformationForm";
import { getProgressStepIndex } from "@/components/TransformationDetails/TransformationDetails.helpers";
import type {
  SourceImageListItemProps,
  TransformationDetailsProps,
  TransformationImagePanelProps,
  TransformationProgressProps,
} from "@/components/TransformationDetails/TransformationDetails.types";
import type { TransformationHistoryStatus } from "@/components/TransformationHistory/TransformationHistory.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";
import { formatDateTime } from "@/shared/dateFormatting";
import { formatFileSize } from "@/shared/fileFormatting";

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
  completed: "bg-emerald-500/12 text-emerald-200 ring-emerald-300/50",
  failed: "bg-rose-500/12 text-rose-200 ring-rose-300/50",
} as const;

const activeStatuses = new Set<TransformationHistoryStatus>([
  "staging",
  "submitting",
  "queued",
  "processing",
  "saving_output",
]);

const processingMessages: Partial<Record<TransformationHistoryStatus, string>> = {
  staging: "Your source image is being prepared for transformation.",
  submitting: "Sending your settings to the transformation service…",
  queued: "Your image is queued and will start processing shortly.",
  processing: "Your image is being transformed. This can take a few minutes.",
  saving_output: "The transformation is complete. Saving your generated image…",
};

const progressSteps = [
  { label: "Source prepared", description: "Your image is ready." },
  { label: "Request sent", description: "Waiting for the AI service." },
  { label: "AI generating", description: "Creating your image." },
  { label: "Saving result", description: "Preparing the final file." },
  { label: "Complete", description: "Your image is ready." },
] as const;

function ImagePanel({
  label,
  description,
  url,
  emptyTitle,
  emptyDescription,
  linkLabel,
  fileName,
  fileMeta,
  downloadUrl,
  isLoading = false,
  isGenerated = false,
}: TransformationImagePanelProps) {
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
        <div className={`relative z-10 mt-4 overflow-hidden rounded-lg bg-slate-950 ${isGenerated ? "min-h-72 sm:min-h-[32rem] ring-1 ring-violet-300/30 shadow-[0_12px_28px_rgb(0_0_0_/_34%)]" : "aspect-square"}`}>
          <Image
            fill
            // The result card is narrower than the viewport because of the app shell and panel padding.
            sizes="(max-width: 639px) calc(100vw - 4rem), (max-width: 1023px) calc(100vw - 6rem), (max-width: 1279px) calc(100vw - 25rem), 960px"
            loading={isGenerated ? "eager" : "lazy"}
            src={url}
            alt={`${label} preview`}
            className="object-contain"
          />
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-xl border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
              aria-label={`Download ${label.toLowerCase()}`}
              title="Download image"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true">
                <path d="M10 3v9m0 0 3.25-3.25M10 12 6.75 8.75M4.5 14.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      ) : (
        <div className={`relative z-10 mt-4 flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-5 text-center ${isGenerated ? "min-h-72 sm:min-h-[32rem]" : "aspect-square min-h-52"}`}>
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

function SourceImageListItem({
  url,
  fileName,
  fileMeta,
  onPreview,
}: SourceImageListItemProps) {
  const isPreviewAvailable = Boolean(url);

  return (
    <button
      type="button"
      onClick={onPreview}
      disabled={!isPreviewAvailable}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50/70"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-200">
        {url ? <Image fill sizes="48px" src={url} alt="Source image thumbnail" className="object-cover" /> : <span className="flex size-full items-center justify-center text-slate-400">—</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">Source image</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500" title={fileName}>{fileName}</span>
        <span className="mt-1 block text-xs text-slate-400">{fileMeta}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-violet-700">{isPreviewAvailable ? "View" : "Unavailable"}</span>
    </button>
  );
}

function TransformationProgress({
  status,
  errorStage,
}: TransformationProgressProps) {
  const currentStepIndex = getProgressStepIndex(status, errorStage);
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(isCompleted);

  return (
    <section className="border-b border-violet-100 bg-violet-50/70 px-5 py-5 sm:px-6" aria-labelledby="transformation-progress-title" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="transformation-progress-title" className="text-sm font-semibold text-slate-950">Transformation progress</h2>
          {isCompleted ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">Your generated image is ready.</p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-5 text-slate-500 sm:hidden">Live status from the AI service.</p>
              <p className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">This view updates automatically as the provider sends status updates.</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-end gap-2 sm:items-center">
          {isCompleted && (
            <button
              type="button"
              onClick={() => setIsProgressCollapsed((isCollapsed) => !isCollapsed)}
              aria-expanded={!isProgressCollapsed}
              aria-controls="transformation-progress-steps"
              className="text-xs font-medium text-violet-700 transition hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              {isProgressCollapsed ? "Show progress" : "Hide progress"}
            </button>
          )}
          {!isCompleted && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isFailed ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>
              {statusLabels[status]}
            </span>
          )}
        </div>
      </div>
      {!isProgressCollapsed && (
        <div id="transformation-progress-steps">
          <ol className="mt-5 space-y-3 sm:hidden" aria-label="Transformation steps">
        {progressSteps.map((step, index) => {
          const isCurrentStep = index === currentStepIndex && !isCompleted && !isFailed;
          const isCompletedStep = index < currentStepIndex || isCompleted;
          const isFailedStep = isFailed && index === currentStepIndex;
          const isCurrentConnector = index === currentStepIndex && !isCompleted && !isFailed;
          const isCompletedConnector = index < currentStepIndex || isCompleted;

          return (
            <li key={step.label} className="relative flex min-w-0 items-start gap-3">
              {index < progressSteps.length - 1 && (
                <span
                  className={`absolute left-3.5 top-7 h-[calc(100%+0.75rem)] w-px ${isCompletedConnector ? "bg-emerald-400/70" : isCurrentConnector ? "bg-violet-400/60" : "bg-slate-200"}`}
                  aria-hidden="true"
                />
              )}
              <span className={`relative flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-4 ring-[#2b2142] ${isFailedStep ? "bg-rose-500 text-white" : isCompletedStep ? "bg-emerald-500 text-white" : isCurrentStep ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {isCompletedStep ? "✓" : index + 1}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className={`block text-xs font-semibold ${isCurrentStep || isCompletedStep || isFailedStep ? "text-slate-900" : "text-slate-500"}`}>{step.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-slate-400">{step.description}</span>
              </span>
            </li>
          );
        })}
          </ol>
          <ol className="mt-5 hidden gap-3 sm:grid sm:grid-cols-5 sm:gap-2">
        {progressSteps.map((step, index) => {
          const isCurrentStep = index === currentStepIndex && !isCompleted && !isFailed;
          const isCompletedStep = index < currentStepIndex || isCompleted;
          const isFailedStep = isFailed && index === currentStepIndex;
          const isCurrentConnector = index === currentStepIndex && !isCompleted && !isFailed;
          const isCompletedConnector = index < currentStepIndex || isCompleted;
          const shouldAnimateConnector = !isCompleted && !isFailed && (
            isCurrentConnector || isCompletedConnector
          );

          return (
            <li key={step.label} className="relative min-w-0 sm:pr-2">
              {index < progressSteps.length - 1 && (
                <span
                  className={`absolute left-5 top-4 hidden h-px w-[calc(100%-1rem)] overflow-hidden sm:block ${isCompletedConnector ? "bg-emerald-400/70" : isCurrentConnector ? "bg-violet-400/60" : "bg-slate-200"}`}
                  aria-hidden="true"
                >
                  {shouldAnimateConnector && (
                    <span className={`transformation-progress-flow absolute inset-y-0 left-0 w-2/5 ${isCompletedConnector ? "bg-emerald-100" : "bg-violet-100"}`} />
                  )}
                </span>
              )}
              <div className="relative flex items-start gap-3 sm:flex-col sm:gap-2">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-[#2b2142] ${isFailedStep ? "bg-rose-500 text-white" : isCompletedStep ? "bg-emerald-500 text-white" : isCurrentStep ? "bg-violet-600 text-white shadow-[0_0_0_5px_rgb(139_92_246_/_16%)]" : "bg-slate-200 text-slate-500"}`}>
                  {isCompletedStep ? "✓" : index + 1}
                </span>
                <span className="min-w-0 pt-1 sm:pt-0">
                  <span className={`block text-xs font-semibold ${isCurrentStep || isCompletedStep || isFailedStep ? "text-slate-900" : "text-slate-500"}`}>{step.label}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-400">{step.description}</span>
                </span>
              </div>
            </li>
          );
        })}
          </ol>
        </div>
      )}
    </section>
  );
}

export default function TransformationDetails({
  transformation,
}: TransformationDetailsProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isSourcePreviewOpen, setIsSourcePreviewOpen] = useState(false);
  const { request, sourceImage } = transformation;
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
          <div className="min-w-0 sm:max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.14em] text-violet-700 uppercase">{transformation.status === "ready" ? "Step 1 · Source image" : "Project result"}</p>
            <h1 id="transformation-details-title" className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {transformation.status === "ready" ? "Source ready" : request?.name || sourceImage.originalName}
            </h1>
            <p className="mt-2 text-sm text-slate-400">{transformation.status === "ready" ? "Review your image, then configure its new visual direction." : `Created ${formatDateTime(transformation.createdAt)}`}</p>
          </div>
          <span className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${statusClasses[transformation.status]}`}>
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

        {(isActive || isCompleted || transformation.status === "failed") && (
          <TransformationProgress
            key={`${transformation.status}-${transformation.error?.stage ?? ""}`}
            status={transformation.status}
            errorStage={transformation.error?.stage}
          />
        )}

        {transformation.error && (
          <div className="border-b border-rose-500/25 bg-rose-50/70 px-5 py-4 sm:px-6" role="alert">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-sm font-semibold text-rose-700">!</span>
              <div>
                <p className="text-sm font-semibold text-rose-950">This transformation needs attention</p>
                <p className="mt-1.5 text-sm leading-6 text-rose-800">{transformation.error.message}</p>
                {transformation.error.retryable && (
                  transformation.error.stage === "output" ? (
                    <p className="mt-2 text-xs text-rose-700">The generated image is ready. Saving it will retry automatically.</p>
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

        <div className="p-5 sm:p-6">
          {transformation.status === "ready" ? (
            <div className="grid grid-cols-[minmax(0,8rem)_1fr] gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-5">
              <button type="button" onClick={() => setIsSourcePreviewOpen(true)} className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-950 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
                {sourceImage.url ? <Image fill sizes="(max-width: 640px) 50vw, 30vw" src={sourceImage.url} alt={`Source image: ${sourceImage.originalName}`} className="object-contain" /> : <span className="flex size-full items-center justify-center text-slate-400">Preview unavailable</span>}
              </button>
              <div className="flex min-w-0 flex-col justify-center">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  Ready to configure
                </span>
                <p className="mt-3 truncate text-base font-semibold text-slate-950" title={sourceImage.originalName}>{sourceImage.originalName}</p>
                <dl className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <div className="rounded-lg bg-slate-100 px-2.5 py-1.5"><dt className="sr-only">Format</dt><dd>{sourceImage.mimeType.split("/")[1]?.toUpperCase() ?? "Image"}</dd></div>
                  <div className="rounded-lg bg-slate-100 px-2.5 py-1.5"><dt className="sr-only">File size</dt><dd>{formatFileSize(sourceImage.bytes)}</dd></div>
                </dl>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true"><path d="M6.5 9V6.75a3.5 3.5 0 0 1 7 0V9M5.5 9h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" strokeLinecap="round" /></svg>
                  Stored securely and ready to send to the transformation service.
                </p>
              </div>
            </div>
          ) : (
            <>
              <SourceImageListItem
                url={sourceImage.url}
                fileName={sourceImage.originalName}
                fileMeta={`${sourceImage.mimeType.split("/")[1]?.toUpperCase() ?? "Image"} · ${formatFileSize(sourceImage.bytes)}`}
                onPreview={() => setIsSourcePreviewOpen(true)}
              />
              {transformation.outputs.length > 0 && <div className="mt-5 grid min-w-0 gap-5">
                {transformation.outputs.map((output, index) => (
              <ImagePanel
                key={output.url}
                label={transformation.outputs.length === 1 ? "Generated image" : `Generated image ${index + 1}`}
                description="AI-transformed result"
                url={output.url}
                emptyTitle="Preview unavailable"
                emptyDescription="The generated image could not be previewed."
                linkLabel="Open result"
                fileName={request?.name || `Generated result ${index + 1}`}
                fileMeta={`Result ${index + 1} of ${transformation.outputs.length}`}
                downloadUrl={`/api/download?transformationId=${encodeURIComponent(transformation.id)}&outputIndex=${index}`}
                isGenerated
              />
                ))}
              </div>}
            </>
          )}
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
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Model</dt><dd className="mt-1.5 font-medium text-slate-700">{request.model ?? "Provider default"}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Resolution</dt><dd className="mt-1.5 font-medium text-slate-700">{request.resolution ?? "Provider default"}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Aspect ratio</dt><dd className="mt-1.5 font-medium text-slate-700">{request.aspectRatio ?? "Auto"}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><dt className="text-xs text-slate-400">Images</dt><dd className="mt-1.5 font-medium text-slate-700">{request.imageCount ?? 1}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2 lg:col-span-3"><dt className="text-xs text-slate-400">Edit prompt</dt><dd className="mt-1.5 leading-6 text-slate-600">{request.style.prompt}</dd></div>
            </dl>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-400 sm:px-6">
          <span>Last updated {formatDateTime(transformation.updatedAt)}</span>
          {transformation.completedAt && <span>Completed {formatDateTime(transformation.completedAt)}</span>}
        </footer>
      </section>

      {isSourcePreviewOpen && sourceImage.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Source image preview">
          <button type="button" className="absolute inset-0 bg-slate-950/75" onClick={() => setIsSourcePreviewOpen(false)} aria-label="Close source image preview" />
          <div className="relative z-10 flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-slate-900">{sourceImage.originalName}</p>
              <button type="button" onClick={() => setIsSourcePreviewOpen(false)} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">Close</button>
            </div>
            <div className="relative min-h-72 flex-1 bg-slate-950" style={{ height: "min(72vh, 48rem)" }}>
              <Image
                fill
                sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 4rem), 960px"
                src={sourceImage.url}
                alt="Source image preview"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {transformation.status === "ready" && <TransformationForm transformationId={transformation.id} />}
    </>
  );
}
