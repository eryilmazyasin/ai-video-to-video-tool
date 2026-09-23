import { ObjectId } from "mongodb";

import { getAnonymousOwner, setAnonymousOwnerCookie } from "@/server/auth/anonymousOwner";
import { resetRetryableTransformation } from "@/server/db-actions/transformationActions";
import { retryRequestSchema } from "@/server/schemas/transformationSchemas";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = retryRequestSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "A valid transformation ID is required." }, { status: 400 });
  }

  try {
    const owner = getAnonymousOwner(request);
    const transformation = await resetRetryableTransformation(
      new ObjectId(input.data.transformationId),
      owner.ownerId,
    );

    if (!transformation) {
      return NextResponse.json(
        { error: "This transformation cannot be retried. The provider may retry it automatically." },
        { status: 409 },
      );
    }

    const response = NextResponse.json({
      transformation: { id: input.data.transformationId, status: "ready" },
    });

    if (owner.shouldSetCookie) {
      setAnonymousOwnerCookie(response, owner.ownerId);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: "The transformation could not be prepared for retry. Please try again." },
      { status: 500 },
    );
  }
}
