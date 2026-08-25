import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { resolveFleetAvatarAsset } from "@/lib/fleet/managedProfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ asset: string }> }
) {
  const { asset } = await context.params;
  const filePath = resolveFleetAvatarAsset(asset);
  if (!filePath) return NextResponse.json({ error: "Fleet avatar asset not found." }, { status: 404 });
  const content = await readFile(filePath);
  return new Response(content, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
