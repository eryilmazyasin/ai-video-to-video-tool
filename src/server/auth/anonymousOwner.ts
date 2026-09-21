import { randomUUID } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

const anonymousOwnerCookieName = "ai_video_owner";
const anonymousOwnerMaxAge = 60 * 60 * 24 * 30;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getExistingAnonymousOwner(request: NextRequest) {
  const existingOwnerId = request.cookies.get(anonymousOwnerCookieName)?.value;

  return existingOwnerId && uuidPattern.test(existingOwnerId)
    ? existingOwnerId
    : null;
}

export function getAnonymousOwner(request: NextRequest) {
  const existingOwnerId = getExistingAnonymousOwner(request);

  if (existingOwnerId) {
    return { ownerId: existingOwnerId, shouldSetCookie: false };
  }

  // This is not a login session; it only separates anonymous browser histories.
  return { ownerId: randomUUID(), shouldSetCookie: true };
}

export function setAnonymousOwnerCookie(response: NextResponse, ownerId: string) {
  response.cookies.set({
    name: anonymousOwnerCookieName,
    value: ownerId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: anonymousOwnerMaxAge,
  });
}
