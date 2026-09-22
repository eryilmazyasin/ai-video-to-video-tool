"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import CustomSelect from "@/components/CustomSelect/CustomSelect";
import type {
  TransformationApiResponse,
  TransformationFormErrors,
  TransformationFormProps,
  TransformationFormValues,
} from "@/components/TransformationForm/TransformationForm.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";
import {
  videoToVideoArtStyles,
  videoToVideoModels,
  videoToVideoPromptTypes,
  videoToVideoVersions,
} from "@/shared/videoToVideoOptions";

const maximumClipDurationSeconds = 15;
const maximumNameLength = 100;
const maximumPromptLength = 1_000;

const artStyleOptions = videoToVideoArtStyles.map((artStyle) => ({
  value: artStyle,
  label: artStyle,
}));
const modelOptions = videoToVideoModels.map((model) => ({
  value: model,
  label: model === "default" ? "Provider default" : model,
}));
const versionOptions = videoToVideoVersions.map((version) => ({
  value: version,
  label: version === "default" ? "Provider default" : version.toUpperCase(),
}));
const frameRateOptions = [
  { value: "FULL", label: "Full frame rate" },
  { value: "HALF", label: "Half frame rate" },
] as const;

const initialValues: TransformationFormValues = {
  name: "",
  startSeconds: "0",
  endSeconds: "15",
  fpsResolution: "HALF",
  artStyle: "No Art Style",
  model: "default",
  promptType: "default",
  prompt: "",
  version: "v2",
};

function isTransformationApiResponse(value: unknown): value is TransformationApiResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transformation = (value as Record<string, unknown>).transformation;

  return Boolean(
    transformation &&
      typeof transformation === "object" &&
      typeof (transformation as Record<string, unknown>).id === "string" &&
      (transformation as Record<string, unknown>).status === "queued",
  );
}

function getApiErrorMessage(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).error === "string"
  ) {
    return (value as Record<string, string>).error;
  }

  return "The transformation could not be submitted. Please try again.";
}

function getPromptTypeLabel(promptType: TransformationFormValues["promptType"]) {
  if (promptType === "append_default") {
    return "Add to the default prompt";
  }

  if (promptType === "custom") {
    return "Use only my prompt";
  }

  return "Use the default prompt";
}

function validateValues(values: TransformationFormValues): TransformationFormErrors {
  const errors: TransformationFormErrors = {};
  const startSeconds = Number(values.startSeconds);
  const endSeconds = Number(values.endSeconds);
  const promptIsRequired =
    values.promptType === "custom" || values.promptType === "append_default";

  if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 3600) {
    errors.startSeconds = "Use a time between 0 and 3,600 seconds.";
  }

  if (!Number.isFinite(endSeconds) || endSeconds <= 0 || endSeconds > 3600) {
    errors.endSeconds = "Use a time between 0 and 3,600 seconds.";
  }

  if (endSeconds <= startSeconds) {
    errors.endSeconds = "End time must be later than the start time.";
  }

  if (endSeconds - startSeconds > maximumClipDurationSeconds) {
    errors.endSeconds = "The selected clip must be 15 seconds or shorter.";
  }

  if (values.name.trim().length > maximumNameLength) {
    errors.name = "Use 100 characters or fewer.";
  }

  if (values.prompt.trim().length > maximumPromptLength) {
    errors.prompt = "Use 1,000 characters or fewer.";
  }

  if (promptIsRequired && !values.prompt.trim()) {
    errors.prompt = "Add a prompt for the selected prompt behavior.";
  }

  return errors;
}

export default function TransformationForm({ transformationId }: TransformationFormProps) {
  const [values, setValues] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<TransformationFormErrors>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const promptIsRequired =
    values.promptType === "custom" || values.promptType === "append_default";
  const clipDuration = Math.max(
    0,
    Number(values.endSeconds) - Number(values.startSeconds),
  );
  const isFormDisabled = isSubmitting || isQueued;

  function handleValueChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;

    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }));
    setSubmissionError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateValues(values);

    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }

    setFormErrors({});
    setSubmissionError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transformationId,
          ...(values.name.trim() ? { name: values.name.trim() } : {}),
          startSeconds: Number(values.startSeconds),
          endSeconds: Number(values.endSeconds),
          fpsResolution: values.fpsResolution,
          style: {
            artStyle: values.artStyle,
            model: values.model,
            promptType: values.promptType,
            ...(values.prompt.trim() ? { prompt: values.prompt.trim() } : {}),
            version: values.version,
          },
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status !== 202 || !isTransformationApiResponse(body)) {
        throw new Error(getApiErrorMessage(body));
      }

      setIsQueued(true);
      window.dispatchEvent(new Event(transformationHistoryRefreshEvent));
    } catch (submissionError) {
      setSubmissionError(
        submissionError instanceof Error
          ? submissionError.message
          : "The transformation could not be submitted. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60"
      aria-labelledby="transformation-settings-title"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-semibold text-violet-700">
            {isQueued ? (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true"><path d="m5.5 10 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : "2"}
          </span>
          <div aria-live="polite">
            <p className="text-xs font-semibold tracking-[0.12em] text-violet-700 uppercase">{isQueued ? "Request accepted" : "Step 2 · AI transformation"}</p>
            <h2 id="transformation-settings-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              {isQueued ? "Transformation queued" : "Configure & generate"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {isQueued
                ? "Processing continues in the background. Follow its live status from your projects."
                : "Fine-tune the clip and creative direction, then start the AI generation."}
            </p>
          </div>
        </div>
        <button
          type="submit"
          form="transformation-settings-form"
          disabled={isFormDisabled}
          className="ai-cta flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-300/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60 sm:w-auto"
        >
          <span className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_45%)]" aria-hidden="true" />
          {isSubmitting ? (
            <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />Submitting…</>
          ) : isQueued ? (
            <>Queued</>
          ) : (
            <><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4" aria-hidden="true"><path d="m10 3 1.1 3.4a3.5 3.5 0 0 0 2.3 2.3L17 10l-3.6 1.3a3.5 3.5 0 0 0-2.3 2.3L10 17l-1.1-3.4a3.5 3.5 0 0 0-2.3-2.3L3 10l3.6-1.3a3.5 3.5 0 0 0 2.3-2.3L10 3Z" strokeLinejoin="round" /></svg>Generate</>
          )}
        </button>
      </div>

      <form id="transformation-settings-form" onSubmit={handleSubmit}>
        <div className="p-5 sm:p-6">
          <div className="min-w-0 space-y-7">
            <div>
              <label className="text-sm font-semibold text-slate-950" htmlFor="transformation-name">
                Project name <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="transformation-name"
                name="name"
                type="text"
                value={values.name}
                onChange={handleValueChange}
                maxLength={maximumNameLength}
                disabled={isFormDisabled}
                placeholder="e.g. Retro campaign concept"
                className={`mt-2 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-3 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${formErrors.name ? "border-rose-400" : "border-slate-200"}`}
                aria-describedby="transformation-name-help"
              />
              <p id="transformation-name-help" className="mt-2 text-xs leading-5 text-slate-400">
                Only used to identify this project in your history.
              </p>
              {formErrors.name && <p className="mt-1 text-xs text-rose-700" role="alert">{formErrors.name}</p>}
            </div>

            <fieldset disabled={isFormDisabled} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <legend className="text-sm font-semibold text-slate-950">Clip range</legend>
                  <p className="mt-2 text-xs leading-5 text-slate-400">Choose up to 15 seconds from the source video.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {Number.isFinite(clipDuration) ? clipDuration.toFixed(1) : "0.0"}s selected
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600" htmlFor="start-seconds">Starts at</label>
                  <div className="relative mt-2">
                    <input
                      id="start-seconds"
                      name="startSeconds"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="3600"
                      step="0.1"
                      required
                      value={values.startSeconds}
                      onChange={handleValueChange}
                      className={`w-full rounded-xl border bg-white px-3.5 py-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:ring-3 focus:ring-violet-100 disabled:bg-slate-100 ${formErrors.startSeconds ? "border-rose-400" : "border-slate-200"}`}
                      aria-describedby="start-seconds-error"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">sec</span>
                  </div>
                  {formErrors.startSeconds && <p id="start-seconds-error" className="mt-1 text-xs text-rose-700" role="alert">{formErrors.startSeconds}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600" htmlFor="end-seconds">Ends at</label>
                  <div className="relative mt-2">
                    <input
                      id="end-seconds"
                      name="endSeconds"
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      max="3600"
                      step="0.1"
                      required
                      value={values.endSeconds}
                      onChange={handleValueChange}
                      className={`w-full rounded-xl border bg-white px-3.5 py-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:ring-3 focus:ring-violet-100 disabled:bg-slate-100 ${formErrors.endSeconds ? "border-rose-400" : "border-slate-200"}`}
                      aria-describedby="end-seconds-error"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">sec</span>
                  </div>
                  {formErrors.endSeconds && <p id="end-seconds-error" className="mt-1 text-xs text-rose-700" role="alert">{formErrors.endSeconds}</p>}
                </div>
              </div>
            </fieldset>

            <div>
              <label className="text-sm font-semibold text-slate-950" htmlFor="art-style">Visual style</label>
              <div className="mt-2">
                <CustomSelect
                id="art-style"
                name="artStyle"
                value={values.artStyle}
                options={artStyleOptions}
                onValueChange={(artStyle) => {
                  setValues((currentValues) => ({ ...currentValues, artStyle }));
                  setSubmissionError(null);
                }}
                disabled={isFormDisabled}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Choose from every style supported by the video model.</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-950">Prompt control</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">Decide whether Magic Hour leads the direction or follows your instructions.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {videoToVideoPromptTypes.map((promptType) => (
                  <label
                    key={promptType}
                    className={`cursor-pointer rounded-xl border p-3 transition ${values.promptType === promptType ? "border-violet-300 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-200"}`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="promptType"
                      value={promptType}
                      checked={values.promptType === promptType}
                      onChange={handleValueChange}
                      disabled={isFormDisabled}
                    />
                    <span className="block text-xs font-semibold text-slate-800">{getPromptTypeLabel(promptType)}</span>
                    <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                      {promptType === "default" ? "Fastest setup" : promptType === "append_default" ? "Balanced control" : "Full control"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {promptIsRequired && (
              <div>
                <label className="text-sm font-semibold text-slate-950" htmlFor="prompt">Creative prompt</label>
                <textarea
                  id="prompt"
                  name="prompt"
                  value={values.prompt}
                  onChange={handleValueChange}
                  maxLength={maximumPromptLength}
                  required
                  disabled={isFormDisabled}
                  rows={4}
                  placeholder="Describe the atmosphere, colors, lighting and visual details you want…"
                  className={`mt-2 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-3 focus:ring-violet-100 disabled:bg-slate-100 ${formErrors.prompt ? "border-rose-400" : "border-slate-200"}`}
                  aria-describedby="prompt-help prompt-error"
                />
                <div className="mt-1.5 flex items-start justify-between gap-3">
                  <p id="prompt-help" className="text-xs leading-5 text-slate-400">Be specific about the look, not the action in the video.</p>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{values.prompt.length}/{maximumPromptLength}</span>
                </div>
                {formErrors.prompt && <p id="prompt-error" className="mt-1 text-xs text-rose-700" role="alert">{formErrors.prompt}</p>}
              </div>
            )}

            <details open={showAdvancedOptions} onToggle={(event) => setShowAdvancedOptions(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
                <span className="flex items-center justify-between gap-3">
                  Advanced model settings
                  <span className="text-xs font-normal text-slate-400">Frame rate · Model · Version</span>
                </span>
              </summary>
              <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-slate-600" htmlFor="fps-resolution">Frame rate</label>
                  <div className="mt-2">
                    <CustomSelect id="fps-resolution" name="fpsResolution" value={values.fpsResolution} options={frameRateOptions} onValueChange={(fpsResolution) => setValues((currentValues) => ({ ...currentValues, fpsResolution }))} disabled={isFormDisabled} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600" htmlFor="model">Model</label>
                  <div className="mt-2">
                    <CustomSelect id="model" name="model" value={values.model} options={modelOptions} onValueChange={(model) => setValues((currentValues) => ({ ...currentValues, model }))} disabled={isFormDisabled} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600" htmlFor="version">Version</label>
                  <div className="mt-2">
                    <CustomSelect id="version" name="version" value={values.version} options={versionOptions} onValueChange={(version) => setValues((currentValues) => ({ ...currentValues, version }))} disabled={isFormDisabled} />
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="relative isolate overflow-hidden rounded-b-2xl border-t border-violet-200/70 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-indigo-100 px-5 py-6 sm:px-6">
          <span className="pointer-events-none absolute -top-24 right-6 -z-10 size-56 rounded-full bg-fuchsia-200/40 blur-3xl" aria-hidden="true" />
          <span className="pointer-events-none absolute -bottom-28 left-1/3 -z-10 size-56 rounded-full bg-indigo-200/45 blur-3xl" aria-hidden="true" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-violet-700 shadow-sm ring-1 ring-violet-200/70 backdrop-blur-sm">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4" aria-hidden="true"><path d="m10 3 1.1 3.4a3.5 3.5 0 0 0 2.3 2.3L17 10l-3.6 1.3a3.5 3.5 0 0 0-2.3 2.3L10 17l-1.1-3.4a3.5 3.5 0 0 0-2.3-2.3L3 10l3.6-1.3a3.5 3.5 0 0 0 2.3-2.3L10 3Z" strokeLinejoin="round" /></svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-950">{isQueued ? "Your AI video is in the queue" : "Ready to create your AI video"}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{isQueued ? "You can safely leave this page while processing continues." : "Generation continues safely in the background after submission."}</p>
                </div>
              </div>
              <dl className="mt-4 flex flex-wrap gap-2 text-xs">
                <div className="rounded-lg border border-white/80 bg-white/65 px-3 py-2 text-slate-700 shadow-sm backdrop-blur-sm"><dt className="inline text-slate-400">Clip </dt><dd className="inline font-medium">{Number.isFinite(clipDuration) ? clipDuration.toFixed(1) : "0.0"} sec</dd></div>
                <div className="max-w-56 truncate rounded-lg border border-white/80 bg-white/65 px-3 py-2 text-slate-700 shadow-sm backdrop-blur-sm" title={values.artStyle}><dt className="inline text-slate-400">Style </dt><dd className="inline font-medium">{values.artStyle}</dd></div>
                <div className="rounded-lg border border-white/80 bg-white/65 px-3 py-2 text-slate-700 shadow-sm backdrop-blur-sm"><dt className="inline text-slate-400">Frame rate </dt><dd className="inline font-medium">{values.fpsResolution === "HALF" ? "Half" : "Full"}</dd></div>
              </dl>
              {submissionError && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-5 text-rose-900" role="alert">{submissionError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isFormDisabled}
              className="ai-cta flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-xl shadow-violet-300/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60 lg:w-auto"
            >
              {isSubmitting ? (
                <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />Submitting…</>
              ) : isQueued ? (
                <>Transformation queued</>
              ) : (
                <>Generate video<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true"><path d="M4 10h12m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg></>
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
