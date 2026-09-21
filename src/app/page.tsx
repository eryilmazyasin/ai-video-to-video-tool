import TransformationHistory from "@/components/TransformationHistory/TransformationHistory";
import VideoUploader from "@/components/VideoUploader/VideoUploader";

export default function Home() {
  return (
    <main className="flex flex-1 bg-zinc-50 px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col justify-center">
        <section className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold tracking-[0.16em] text-violet-700 uppercase">
            AI video-to-video
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Start with your source video
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600 sm:text-lg">
            Upload a video, choose its new visual style, and follow the result as it processes.
          </p>
        </section>
        <VideoUploader />
        <TransformationHistory />
      </div>
    </main>
  );
}
