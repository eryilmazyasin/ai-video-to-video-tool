import { getExistingAnonymousOwner } from "@/server/auth/anonymousOwner";
import { findByIdForOwner } from "@/server/db-actions/transformationActions";
import { downloadQuerySchema } from "@/server/schemas/transformationSchemas";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function getImageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";

  return "png";
}

function getDownloadFileName(originalName: string, outputIndex: number, contentType: string) {
  const baseName = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z\d-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generated-image";

  return `${baseName}-result-${outputIndex + 1}.${getImageExtension(contentType)}`;
}

export async function GET(request: NextRequest) {
  const parsedQuery = downloadQuerySchema.safeParse({
    transformationId: request.nextUrl.searchParams.get("transformationId"),
    outputIndex: request.nextUrl.searchParams.get("outputIndex"),
  });

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "The requested image is invalid." }, { status: 400 });
  }

  const ownerId = getExistingAnonymousOwner(request);

  if (!ownerId) {
    return NextResponse.json({ error: "The requested image was not found." }, { status: 404 });
  }

  const transformation = await findByIdForOwner(
    parsedQuery.data.transformationId,
    ownerId,
  );
  const outputs = transformation?.outputs ?? (
    transformation?.output ? [transformation.output] : []
  );
  const output = outputs[parsedQuery.data.outputIndex];

  if (!transformation || !output) {
    return NextResponse.json({ error: "The requested image was not found." }, { status: 404 });
  }

  try {
    const response = await fetch(output.cloudinaryUrl);
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";

    if (!response.ok || !response.body || !contentType.startsWith("image/")) {
      throw new Error("Generated image download failed.");
    }

    return new NextResponse(response.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${getDownloadFileName(
          transformation.input.originalName,
          parsedQuery.data.outputIndex,
          contentType,
        )}"`,
        "Content-Type": contentType,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The generated image could not be downloaded. Please try again." },
      { status: 502 },
    );
  }
}
