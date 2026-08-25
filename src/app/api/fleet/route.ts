import { NextResponse } from "next/server";

import {
  listFleetBackups,
  readManagedFleetSnapshot,
  runFleetCommand,
  type FleetCommand,
} from "@/lib/fleet/managedProfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MUTATING_ACTIONS = new Set<FleetCommand>(["apply", "rollback"]);

export async function GET() {
  const fleet = await readManagedFleetSnapshot();
  if (!fleet) return NextResponse.json({ configured: false });
  return NextResponse.json({ ...fleet, backups: listFleetBackups() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: FleetCommand;
    validatedHash?: string;
    previewedHash?: string;
  } | null;
  const action = body?.action;
  if (!action || !["validate", "diff", "apply", "rollback"].includes(action)) {
    return NextResponse.json({ error: "Unsupported fleet action." }, { status: 400 });
  }

  const fleet = await readManagedFleetSnapshot();
  if (!fleet) return NextResponse.json({ error: "Managed fleet is not configured." }, { status: 404 });
  if (MUTATING_ACTIONS.has(action) && !fleet.mutationsEnabled) {
    return NextResponse.json(
      { error: "Fleet mutations are disabled. Set HERMES3D_FLEET_MUTATIONS=1 in the private launcher." },
      { status: 403 }
    );
  }
  if (
    action === "apply" &&
    (body?.validatedHash !== fleet.sourceHash || body?.previewedHash !== fleet.sourceHash)
  ) {
    return NextResponse.json(
      { error: "Apply requires validate and preview results for the current canonical source hash." },
      { status: 409 }
    );
  }

  const result = await runFleetCommand(action);
  const refreshed = await readManagedFleetSnapshot();
  return NextResponse.json(
    { action, sourceHash: fleet.sourceHash, result, fleet: refreshed },
    { status: result.ok ? 200 : 422 }
  );
}
