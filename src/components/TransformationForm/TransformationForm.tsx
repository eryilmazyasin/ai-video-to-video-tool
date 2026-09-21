"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import type {
  TransformationApiResponse,
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

const initialValues: TransformationFormValues = {
  name: "",
  startSeconds: "0",
  endSeconds: "15",
  fpsResolution: "HALF",
  artStyle: "No Art Style",
  model: "default",
  promptType: "default",
  prompt: "",
  version: "default",
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

function validateValues(values: TransformationFormValues) {
  const startSeconds = Number(values.startSeconds);
  const endSeconds = Number(values.endSeconds);
  const promptIsRequired =
    values.promptType === "custom" || values.promptType === "append_default";

  if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 3600) {
    return "Start time must be between 0 and 3,600 seconds.";
  }

  if (!Number.isFinite(endSeconds) || endSeconds <= 0 || endSeconds > 3600) {
    return "End time must be between 0 and 3,600 seconds.";
  }

  if (endSeconds <= startSeconds) {
    return "End time must be later than start time.";
  }

  if (endSeconds - startSeconds > maximumClipDurationSeconds) {
    return "The selected clip must be 15 seconds or shorter.";
  }

  if (values.name.trim().length > maximumNameLength) {
    return "Name must be 100 characters or fewer.";
  }

  if (values.prompt.trim().length > maximumPromptLength) {
    return "Prompt must be 1,000 characters or fewer.";
  }

  if (promptIsRequired && !values.prompt.trim()) {
    return "A prompt is required for the selected prompt type.";
  }

  return null;
}

export default function TransformationForm({ transformationId }: TransformationFormProps) {
  const [values, setValues] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const promptIsRequired =
    values.promptType === "custom" || values.promptType === "append_default";

  function handleValueChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;

    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateValues(values);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
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
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The transformation could not be submitted. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isQueued) {
    return (
      <section
        className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5"
        aria-live="polite"
      >
        <p className="text-sm font-semibold text-violet-950">Transformation queued</p>
        <p className="mt-2 text-sm leading-6 text-violet-900">
          Your video is in the processing queue. You can keep this page open while it starts.
        </p>
      </section>
    );
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-6"
      aria-labelledby="transformation-settings-title"
    >
      <div>
        <p className="text-sm font-semibold text-violet-700">Transformation settings</p>
        <h2
          id="transformation-settings-title"
          className="mt-1 text-xl font-semibold tracking-tight text-zinc-950"
        >
          Choose how your video should change
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Select a clip up to 15 seconds long, then choose the look and prompt details for your result.
        </p>
      </div>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label
            className="text-sm font-semibold text-zinc-900"
            htmlFor="transformation-name"
          >
            Name <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="transformation-name"
            name="name"
            type="text"
            value={values.name}
            onChange={handleValueChange}
            maxLength={maximumNameLength}
            disabled={isSubmitting}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
            aria-describedby="transformation-name-help"
          />
          <p
            id="transformation-name-help"
            className="mt-1.5 text-xs leading-5 text-zinc-500"
          >
            A private label to help you recognize this transformation later.
          </p>
        </div>

        <fieldset disabled={isSubmitting}>
          <legend className="text-sm font-semibold text-zinc-900">Clip timing</legend>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            Choose a section no longer than 15 seconds.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-800" htmlFor="start-seconds">
                Start time (seconds)
              </label>
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
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-800" htmlFor="end-seconds">
                End time (seconds)
              </label>
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
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
              />
            </div>
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-zinc-900" htmlFor="fps-resolution">
              Frame rate
            </label>
            <select
              id="fps-resolution"
              name="fpsResolution"
              value={values.fpsResolution}
              onChange={handleValueChange}
              disabled={isSubmitting}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
            >
              <option value="FULL">Full frame rate</option>
              <option value="HALF">Half frame rate</option>
            </select>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              Half frame rate is the economical default. Choose full for more motion detail.
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold text-zinc-900" htmlFor="model">
              Model
            </label>
            <select
              id="model"
              name="model"
              value={values.model}
              onChange={handleValueChange}
              disabled={isSubmitting}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
            >
              {videoToVideoModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              Use default unless you have a preferred rendering model.
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-900" htmlFor="art-style">
            Art style
          </label>
          <select
            id="art-style"
            name="artStyle"
            value={values.artStyle}
            onChange={handleValueChange}
            disabled={isSubmitting}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
          >
            {videoToVideoArtStyles.map((artStyle) => (
              <option key={artStyle} value={artStyle}>
                {artStyle}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            Choose “No Art Style” to keep the source look as close as possible.
          </p>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-900" htmlFor="prompt-type">
            Prompt behavior
          </label>
          <select
            id="prompt-type"
            name="promptType"
            value={values.promptType}
            onChange={handleValueChange}
            disabled={isSubmitting}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
          >
            {videoToVideoPromptTypes.map((promptType) => (
              <option key={promptType} value={promptType}>
                {getPromptTypeLabel(promptType)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            The default prompt uses the service’s built-in guidance.
          </p>
        </div>

        {promptIsRequired && (
          <div>
            <label className="text-sm font-semibold text-zinc-900" htmlFor="prompt">
              Prompt
            </label>
            <textarea
              id="prompt"
              name="prompt"
              value={values.prompt}
              onChange={handleValueChange}
              maxLength={maximumPromptLength}
              required
              disabled={isSubmitting}
              rows={4}
              className="mt-2 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
              aria-describedby="prompt-help"
            />
            <p id="prompt-help" className="mt-1.5 text-xs leading-5 text-zinc-500">
              Describe the visual details you want to guide the result.
            </p>
          </div>
        )}

        <div>
          <label className="text-sm font-semibold text-zinc-900" htmlFor="version">
            Version
          </label>
          <select
            id="version"
            name="version"
            value={values.version}
            onChange={handleValueChange}
            disabled={isSubmitting}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:bg-zinc-100"
          >
            {videoToVideoVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            Use the default version unless you need a specific provider version.
          </p>
        </div>

        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:bg-violet-400"
        >
          {isSubmitting ? "Submitting transformation…" : "Start transformation"}
        </button>
      </form>
    </section>
  );
}
