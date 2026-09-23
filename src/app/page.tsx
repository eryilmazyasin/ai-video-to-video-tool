"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import TransformationDetails from "@/components/TransformationDetails/TransformationDetails";
import TransformationHistory from "@/components/TransformationHistory/TransformationHistory";
import type { TransformationHistoryItem } from "@/components/TransformationHistory/TransformationHistory.types";
import ImageUploader from "@/components/ImageUploader/ImageUploader";
import {
  getWorkspaceLocation,
  updateWorkspaceLocation,
} from "@/shared/workspaceLocation";

export default function Home() {
  const [selectedTransformation, setSelectedTransformation] = useState<TransformationHistoryItem | null>(null);
  const [pendingTransformationId, setPendingTransformationId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(() => getWorkspaceLocation().isCreatingNew);
  const [newTransformationKey, setNewTransformationKey] = useState(0);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historyDrawerRef = useRef<HTMLElement>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const requestedTransformationIdRef = useRef<string | null>(
    getWorkspaceLocation().transformationId,
  );

  useEffect(() => {
    if (!isHistoryDrawerOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const historyButton = historyButtonRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsHistoryDrawerOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        historyDrawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href]',
        ) ?? [],
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        return;
      }

      // Keep keyboard focus inside the mobile drawer until it is closed.
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    // Prevent the workspace from scrolling behind the mobile history drawer.
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    drawerCloseButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      historyButton?.focus();
    };
  }, [isHistoryDrawerOpen]);

  const handleSelectTransformation = useCallback((transformation: TransformationHistoryItem) => {
    requestedTransformationIdRef.current = transformation.id;
    setSelectedTransformation(transformation);
    setIsCreatingNew(false);
    setIsHistoryDrawerOpen(false);
    updateWorkspaceLocation(transformation.id, false);
  }, []);
  const handleTransformationsChange = useCallback((transformations: TransformationHistoryItem[]) => {
    const queuedTransformation = pendingTransformationId
      ? transformations.find((transformation) => transformation.id === pendingTransformationId)
      : null;

    if (queuedTransformation) {
      requestedTransformationIdRef.current = queuedTransformation.id;
      setSelectedTransformation(queuedTransformation);
      setPendingTransformationId(null);
      updateWorkspaceLocation(queuedTransformation.id, false);
      return;
    }

    const requestedTransformationId = requestedTransformationIdRef.current;
    const requestedTransformation = requestedTransformationId
      ? transformations.find((transformation) => transformation.id === requestedTransformationId)
      : null;

    if (requestedTransformation) {
      setSelectedTransformation(requestedTransformation);
      setIsCreatingNew(false);
      return;
    }

    setSelectedTransformation((currentSelection) => {
      if (!currentSelection) {
        return currentSelection;
      }

      return transformations.find((transformation) => transformation.id === currentSelection.id) ?? null;
    });
  }, [pendingTransformationId]);
  const handleTransformationQueued = useCallback((transformationId: string) => {
    requestedTransformationIdRef.current = transformationId;
    setPendingTransformationId(transformationId);
    setIsCreatingNew(false);
    updateWorkspaceLocation(transformationId, false);
  }, []);
  const handleStartNewTransformation = useCallback(() => {
    requestedTransformationIdRef.current = null;
    setSelectedTransformation(null);
    setIsCreatingNew(true);
    setNewTransformationKey((currentKey) => currentKey + 1);
    setIsHistoryDrawerOpen(false);
    updateWorkspaceLocation(null, true);
  }, []);

  return (
    <main className="dark-app min-h-[100dvh] bg-[#09090f] text-slate-100 lg:flex">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#0c0c14]/95 px-4 backdrop-blur lg:hidden">
        <button
          ref={historyButtonRef}
          type="button"
          onClick={() => setIsHistoryDrawerOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          aria-expanded={isHistoryDrawerOpen}
          aria-controls="history-sidebar"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true">
            <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" strokeLinecap="round" />
          </svg>
          Projects
        </button>
        <span className="text-sm font-semibold tracking-tight text-slate-950">FrameShift</span>
        <button
          type="button"
          onClick={handleStartNewTransformation}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          New
        </button>
      </header>

      {isHistoryDrawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] lg:hidden"
          onClick={() => setIsHistoryDrawerOpen(false)}
          aria-label="Close project history"
        />
      )}

      <aside
        ref={historyDrawerRef}
        id="history-sidebar"
        className={`fixed inset-y-0 left-0 z-50 min-h-0 w-[min(22rem,calc(100vw-2rem))] flex-col border-r border-white/10 bg-[#10101a] shadow-2xl shadow-black/40 transition-transform duration-200 lg:sticky lg:top-0 lg:z-0 lg:flex lg:h-screen lg:w-[280px] lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          isHistoryDrawerOpen ? "flex translate-x-0" : "hidden -translate-x-full"
        }`}
        role={isHistoryDrawerOpen ? "dialog" : undefined}
        aria-modal={isHistoryDrawerOpen || undefined}
        aria-labelledby="history-sidebar-brand"
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-200">F</span>
            <div>
              <p id="history-sidebar-brand" className="text-sm font-semibold tracking-tight text-slate-950">FrameShift</p>
              <p className="text-xs text-slate-500">Image studio</p>
            </div>
          </div>
          <button
            ref={drawerCloseButtonRef}
            type="button"
            onClick={() => setIsHistoryDrawerOpen(false)}
            className="inline-flex size-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 lg:hidden"
            aria-label="Close project history"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <TransformationHistory
          selectedTransformationId={selectedTransformation?.id ?? null}
          isCreatingNew={isCreatingNew}
          onSelectTransformation={handleSelectTransformation}
          onStartNewTransformation={handleStartNewTransformation}
          onTransformationsChange={handleTransformationsChange}
        />
      </aside>

      <section className="min-w-0 flex-1 px-4 pb-8 pt-8 sm:px-8 sm:pb-10 sm:pt-10 lg:px-12 lg:pb-14 lg:pt-14 xl:px-16">
        <div className="mx-auto w-full max-w-5xl">
          {selectedTransformation ? (
            <TransformationDetails transformation={selectedTransformation} />
          ) : (
            <>
              <section className="mb-9 max-w-2xl">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-violet-700 uppercase">
                    New transformation
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Start with your source image
                  </h1>
                </div>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                  Upload a source image to create a new visual direction with AI.
                </p>
              </section>
              <ImageUploader key={newTransformationKey} onTransformationQueued={handleTransformationQueued} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
