"use client";

import { useState, type FormEvent } from "react";

import CustomSelect from "@/components/CustomSelect/CustomSelect";
import type { CustomSelectOption } from "@/components/CustomSelect/CustomSelect.types";
import type { TransformationFormProps, TransformationFormValues } from "@/components/TransformationForm/TransformationForm.types";
import { transformationHistoryRefreshEvent } from "@/shared/browserEvents";
import {
  getImageToImageResolutions,
  imageToImageAspectRatios,
  imageToImageModels,
  imageToImageOutputCounts,
} from "@/shared/imageToImageOptions";

const initialValues: TransformationFormValues = {
  name: "",
  prompt: "",
  model: "flux-2-klein",
  resolution: "1k",
  aspectRatio: "auto",
  imageCount: 1,
};

const freeTierModels = new Set(["flux-2-klein", "krea-2", "qwen-edit"]);

const modelOptions = imageToImageModels.map((model) => ({
  value: model,
  label: model === "default"
    ? "Provider default (plan-dependent)"
    : freeTierModels.has(model)
      ? `${model} · free-tier`
      : model,
})) satisfies readonly CustomSelectOption<TransformationFormValues["model"]>[];

const aspectRatioOptions = imageToImageAspectRatios.map((aspectRatio) => ({
  value: aspectRatio,
  label: aspectRatio,
})) satisfies readonly CustomSelectOption<TransformationFormValues["aspectRatio"]>[];

const imageCountOptions = imageToImageOutputCounts.map((imageCount) => ({
  value: String(imageCount),
  label: `${imageCount} ${imageCount === 1 ? "image" : "images"}`,
})) satisfies readonly CustomSelectOption<string>[];

const promptExamples = [
  "Change the background to a sunny beach. Keep the person and clothing unchanged.",
  "Make this a watercolor illustration while preserving the composition.",
  "Remove the object on the left and fill the space naturally.",
];

export default function TransformationForm({ transformationId, onQueued }: TransformationFormProps) {
  const [values, setValues] = useState<TransformationFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const availableResolutions = getImageToImageResolutions(values.model);
  const resolutionOptions = availableResolutions.map((resolution) => ({
    value: resolution,
    label: resolution,
  })) satisfies readonly CustomSelectOption<TransformationFormValues["resolution"]>[];
  const isDisabled = isSubmitting || isQueued;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!values.prompt.trim()) {
      setError("Describe the change you want to make to the image.");
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
          model: values.model,
          resolution: values.resolution,
          aspectRatio: values.aspectRatio,
          imageCount: values.imageCount,
          style: { prompt: values.prompt.trim() },
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message = body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
          ? (body as Record<string, string>).error
          : "The image could not be submitted.";
        throw new Error(message);
      }

      setIsQueued(true);
      onQueued?.(transformationId);
      window.dispatchEvent(new Event(transformationHistoryRefreshEvent));
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The image could not be submitted.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold text-slate-950">Configure your image</h2>
      <p className="mt-2 text-sm text-slate-600">Edit one source image with a written instruction. Choose how many results to generate.</p>
      <form className="mt-5 grid gap-5" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Project name
          <input className="rounded-lg border border-slate-200 px-3 py-2" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} maxLength={100} disabled={isDisabled} />
        </label>
        <div>
          <label htmlFor={`edit-prompt-${transformationId}`} className="text-sm font-medium text-slate-700">Edit prompt</label>
          <textarea id={`edit-prompt-${transformationId}`} className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2" value={values.prompt} onChange={(event) => setValues({ ...values, prompt: event.target.value })} maxLength={1000} required disabled={isDisabled} placeholder="Describe what to change and what should stay the same" />
          <p className="mt-1 text-xs text-slate-500">Magic Hour requires a prompt. Describe the change and any details to preserve.</p>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Prompt examples">
            {promptExamples.map((example) => (
              <button key={example} type="button" className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-60" onClick={() => setValues((current) => ({ ...current, prompt: example }))} disabled={isDisabled}>{example}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Model
            <CustomSelect id={`model-${transformationId}`} name="model" value={values.model} options={modelOptions} onValueChange={(model) => {
              const resolutions = getImageToImageResolutions(model);
              setValues((current) => ({ ...current, model, resolution: resolutions.includes(current.resolution) ? current.resolution : resolutions[0] }));
            }} disabled={isDisabled} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Resolution
            <CustomSelect id={`resolution-${transformationId}`} name="resolution" value={values.resolution} options={resolutionOptions} onValueChange={(resolution) => setValues({ ...values, resolution })} disabled={isDisabled} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Aspect ratio
            <CustomSelect id={`aspect-ratio-${transformationId}`} name="aspectRatio" value={values.aspectRatio} options={aspectRatioOptions} onValueChange={(aspectRatio) => setValues({ ...values, aspectRatio })} disabled={isDisabled} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Results
            <CustomSelect id={`image-count-${transformationId}`} name="imageCount" value={String(values.imageCount)} options={imageCountOptions} onValueChange={(imageCount) => setValues({ ...values, imageCount: Number(imageCount) as TransformationFormValues["imageCount"] })} disabled={isDisabled} />
          </label>
        </div>
        <p className="text-xs text-slate-500">Only one source image can be uploaded. More results use more credits; supported result counts can vary by model.</p>
        {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
        <button
          className="ai-cta relative isolate flex min-h-13 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl border border-violet-300/45 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgb(124_58_237_/_34%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:opacity-60"
          disabled={isDisabled}
        >
          {isSubmitting ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />
          ) : isQueued ? (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true"><path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true"><path d="m10 2 1.1 4a3.6 3.6 0 0 0 2.5 2.5L18 10l-4.4 1.5a3.6 3.6 0 0 0-2.5 2.5L10 18l-1.1-4a3.6 3.6 0 0 0-2.5-2.5L2 10l4.4-1.5A3.6 3.6 0 0 0 8.9 6L10 2Z" strokeLinejoin="round" /></svg>
          )}
          <span className="text-base">{isSubmitting ? "Creating your image…" : isQueued ? "Image request queued" : values.imageCount === 1 ? "Generate image" : `Generate ${values.imageCount} images`}</span>
        </button>
      </form>
    </section>
  );
}
