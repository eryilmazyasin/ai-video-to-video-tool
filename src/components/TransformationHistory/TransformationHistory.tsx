"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type {
  TransformationHistoryItem,
  TransformationHistoryFilter,
  TransformationHistoryProps,
  TransformationHistoryResponse,
  TransformationHistoryStatus,
  StatusTooltip,
} from "@/components/TransformationHistory/TransformationHistory.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";
import { getCloudinaryVideoThumbnailUrl } from "@/shared/cloudinaryMedia";

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

const statusFilters: { value: TransformationHistoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Done" },
  { value: "failed", label: "Issues" },
];

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

function formatDate(date: string) {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "Date unavailable";
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const daysAgo = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (daysAgo === 0) {
    return "Today";
  }

  if (daysAgo === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(value);
}

function getProjectContext(transformation: TransformationHistoryItem) {
  if (transformation.request?.style.artStyle) {
    return transformation.request.style.artStyle;
  }

  return transformation.sourceVideo.mimeType.startsWith("video/")
    ? "Source video"
    : "Video project";
}

function getStatusClasses(status: TransformationHistoryStatus) {
  if (status === "failed") {
    return "bg-rose-400 ring-rose-100";
  }

  if (status === "completed") {
    return "bg-emerald-500 ring-emerald-100";
  }

  if (status === "queued") {
    return "bg-amber-400 ring-amber-100";
  }

  if (status === "ready" || status === "submitting" || status === "processing" || status === "saving_output") {
    return "bg-sky-400 ring-sky-100";
  }

  return "bg-slate-400 ring-slate-100";
}

export default function TransformationHistory({
  selectedTransformationId,
  isCreatingNew,
  onSelectTransformation,
  onStartNewTransformation,
  onTransformationsChange,
}: TransformationHistoryProps) {
  const [transformations, setTransformations] = useState<TransformationHistoryItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransformationHistoryFilter>("all");
  const [statusTooltip, setStatusTooltip] = useState<StatusTooltip | null>(null);
  const isMountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const showStatusTooltip = useCallback((
    target: HTMLElement,
    label: string,
    status: TransformationHistoryStatus,
  ) => {
    const { bottom, right, top } = target.getBoundingClientRect();

    setStatusTooltip({
      label,
      left: right + 12,
      status,
      top: top + (bottom - top) / 2,
    });
  }, []);

  const loadHistory = useCallback(async ({ manual = false }: { manual?: boolean } = {}) => {
    if (inFlightRef.current) {
      return;
    }

    const controller = new AbortController();
    const isInitialLoad = !hasLoadedRef.current;
    inFlightRef.current = true;
    abortControllerRef.current = controller;

    if (isMountedRef.current && manual && !isInitialLoad) {
      setIsManualRefreshing(true);
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
        onTransformationsChange(body.transformations);
        const selectedTransformation = body.transformations.find(
          (item) => item.id === selectedTransformationId,
        );

        if (!isCreatingNew && !selectedTransformation && body.transformations[0]) {
          onSelectTransformation(body.transformations[0]);
        }
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
        if (manual) {
          setIsManualRefreshing(false);
        }
      }
    }
  }, [isCreatingNew, onSelectTransformation, onTransformationsChange, selectedTransformationId]);

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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleTransformations = transformations.filter((transformation) => {
    const name = transformation.request?.name || transformation.sourceVideo.originalName;
    const matchesSearch = name.toLowerCase().includes(normalizedSearchQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && transformation.status !== "completed" && transformation.status !== "failed") ||
      (statusFilter === "completed" && transformation.status === "completed") ||
      (statusFilter === "failed" && transformation.status === "failed");

    return matchesSearch && matchesStatus;
  });

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col p-4 sm:p-5" aria-labelledby="transformation-history-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="transformation-history-title" className="text-base font-semibold tracking-tight text-slate-950">
            Recent projects
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {transformations.length === 0 ? "Your video transformations." : `${transformations.length} saved ${transformations.length === 1 ? "project" : "projects"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory({ manual: true })}
          disabled={isInitialLoading || isManualRefreshing}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={`size-3.5 ${isManualRefreshing ? "animate-spin" : ""}`} aria-hidden="true">
            <path d="M15.5 8.25A5.75 5.75 0 1 0 16 12" strokeLinecap="round" />
            <path d="M15.5 4.5v3.75h-3.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {isManualRefreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <button
        type="button"
        onClick={onStartNewTransformation}
        className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(109_40_217_/_28%)] transition hover:bg-violet-500 hover:shadow-[0_12px_28px_rgb(124_58_237_/_38%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4" aria-hidden="true">
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        New transformation
      </button>

      <label className="relative mt-4 block">
        <span className="sr-only">Search transformation history</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true">
          <circle cx="8.75" cy="8.75" r="4.75" />
          <path d="m12.25 12.25 3.5 3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search projects"
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </label>

      <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Filter projects by status">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            aria-pressed={statusFilter === filter.value}
            className={`min-h-8 rounded-lg px-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${
              statusFilter === filter.value
                ? "bg-violet-600 text-white shadow-[0_6px_16px_rgb(109_40_217_/_32%)]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
      {isInitialLoading && (
        <div className="space-y-2" role="status" aria-label="Loading transformation history">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5">
              <span className="size-10 shrink-0 animate-pulse rounded-lg bg-slate-100" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                <span className="block h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
              </span>
            </div>
          ))}
        </div>
      )}

      {!isInitialLoading && error && (
        <div className="rounded-xl border border-rose-200 border-l-2 border-l-rose-400 bg-rose-50/80 p-3 text-xs leading-5 text-rose-900" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadHistory({ manual: true })} className="mt-2 rounded-md font-semibold text-rose-800 underline decoration-rose-300 underline-offset-2 transition hover:text-rose-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">Try again</button>
        </div>
      )}

      {!isInitialLoading && transformations.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs leading-5 text-slate-500">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 size-5 text-slate-400" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="m7 13 2-2 1.5 1.5L12 11l2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Your projects will appear here after your first transformation.
        </div>
      )}

      {transformations.length > 0 && visibleTransformations.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs leading-5 text-slate-500">
          No projects match this view.
          <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }} className="mt-2 block w-full font-semibold text-violet-700 transition hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">Clear search and filters</button>
        </div>
      )}

      {visibleTransformations.length > 0 && (
        <div className="space-y-1.5" aria-live="polite">
          {visibleTransformations.map((transformation) => {
            const thumbnailUrl = getCloudinaryVideoThumbnailUrl(
              transformation.output?.url ?? transformation.sourceVideo.url,
            );

            return (
              <button
                key={transformation.id}
                type="button"
                onClick={() => onSelectTransformation(transformation)}
                onMouseEnter={(event) => showStatusTooltip(event.currentTarget, statusLabels[transformation.status], transformation.status)}
                onMouseLeave={() => setStatusTooltip(null)}
                onFocus={(event) => showStatusTooltip(event.currentTarget, statusLabels[transformation.status], transformation.status)}
                onBlur={() => setStatusTooltip(null)}
                aria-current={selectedTransformationId === transformation.id ? "true" : undefined}
                className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-600 ${
                  selectedTransformationId === transformation.id
                    ? "border-violet-400/50 bg-[#21143f] shadow-[0_8px_20px_rgb(76_29_149_/_28%)]"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className={`relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ${transformation.status === "failed" ? "bg-rose-100 text-rose-500" : transformation.status === "completed" ? "bg-emerald-100 text-emerald-600" : "bg-violet-100 text-violet-600"}`}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5" aria-hidden="true">
                    <rect x="3" y="4" width="14" height="12" rx="2" />
                    <path d="M8.5 7.5 12 10l-3.5 2.5v-5Z" fill="currentColor" stroke="none" />
                  </svg>
                  {thumbnailUrl && (
                    // Cloudinary already delivers this thumbnail at its display size.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover"
                      onError={(event) => event.currentTarget.remove()}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {transformation.request?.name || transformation.sourceVideo.originalName}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-400">
                    {getProjectContext(transformation)} · {formatDate(transformation.createdAt)}
                  </span>
                </span>
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <span
                    className={`size-1.5 rounded-full ring-2 ${getStatusClasses(transformation.status)} ${automaticallyUpdatedStatuses.has(transformation.status) ? "animate-pulse motion-reduce:animate-none" : ""}`}
                    aria-label={statusLabels[transformation.status]}
                    role="status"
                  >
                    <span className="sr-only">{statusLabels[transformation.status]}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      </div>
      {statusTooltip && createPortal(
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#1c1c2b] px-2 py-1 text-[10px] font-medium text-slate-200 shadow-lg shadow-black/40"
          style={{ left: statusTooltip.left, top: statusTooltip.top }}
        >
          <span className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ring-2 ${getStatusClasses(statusTooltip.status)}`} aria-hidden="true" />
          {statusTooltip.label}
        </span>,
        document.body,
      )}
    </section>
  );
}
