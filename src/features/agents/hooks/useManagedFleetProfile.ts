"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fleetSessionHeaders } from "@/lib/fleet/requestAuth";

export type ManagedFleetProfile = {
  id: string;
  displayName: string;
  role: string;
  autonomy: string;
  repositoryScope: string[];
  workspace: { mode: string; write: boolean | string };
  toolPolicy: { allow: string[]; deny: string[] };
  skills: string[];
  memory: {
    curated: string;
    learned: string;
    shared_vaults: string;
    promotion: string;
  };
  heartbeat: { enabled: boolean; responsibility: string };
  approvals: string[];
  prohibited: string[];
  health: {
    status: "current" | "drift" | "not-deployed";
    missingFiles: string[];
    changedFiles: string[];
    deployedHash: string | null;
    deployedCommit: string | null;
    appliedAt: string | null;
  };
};

type FleetResponse = {
  configured: boolean;
  fleetId?: string;
  sourceHash?: string;
  mutationsEnabled?: boolean;
  agents?: ManagedFleetProfile[];
};

type FleetAction = "validate" | "diff" | "apply" | "rollback";

export const useManagedFleetProfile = (agentId: string | null | undefined) => {
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [validatedHash, setValidatedHash] = useState<string | null>(null);
  const [previewedHash, setPreviewedHash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/fleet", {
        cache: "no-store",
        headers: fleetSessionHeaders,
      });
      const payload = (await response.json()) as FleetResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to load managed fleet status.");
      setFleet(payload);
      setError(null);
      if (payload.sourceHash !== validatedHash) {
        setValidatedHash(null);
        setPreviewedHash(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load managed fleet status.");
    } finally {
      setLoading(false);
    }
  }, [validatedHash]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const profile = useMemo(
    () => fleet?.agents?.find((entry) => entry.id === agentId) ?? null,
    [agentId, fleet?.agents]
  );

  const runAction = useCallback(
    async (action: FleetAction) => {
      if (!fleet?.sourceHash || busy) return false;
      setBusy(true);
      setError(null);
      setOutput(null);
      try {
        const response = await fetch("/api/fleet", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...fleetSessionHeaders },
          body: JSON.stringify({ action, validatedHash, previewedHash }),
        });
        const payload = (await response.json()) as {
          error?: string;
          sourceHash?: string;
          result?: { ok: boolean; stdout?: string; stderr?: string };
          fleet?: FleetResponse | null;
        };
        if (!response.ok || !payload.result?.ok) {
          throw new Error(payload.error || payload.result?.stderr || `Fleet ${action} failed.`);
        }
        const sourceHash = payload.sourceHash ?? fleet.sourceHash;
        if (action === "validate") {
          setValidatedHash(sourceHash);
          setPreviewedHash(null);
        } else if (action === "diff") {
          if (validatedHash !== sourceHash) {
            throw new Error("Validate the current canonical source before accepting its diff preview.");
          }
          setPreviewedHash(sourceHash);
        } else {
          setValidatedHash(null);
          setPreviewedHash(null);
        }
        setOutput(payload.result.stdout || `${action} completed.`);
        if (payload.fleet) setFleet(payload.fleet);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `Fleet ${action} failed.`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, fleet?.sourceHash, previewedHash, validatedHash]
  );

  return {
    configured: Boolean(fleet?.configured),
    fleetId: fleet?.fleetId ?? null,
    sourceHash: fleet?.sourceHash ?? null,
    mutationsEnabled: Boolean(fleet?.mutationsEnabled),
    profile,
    loading,
    busy,
    error,
    output,
    validatedHash,
    previewedHash,
    runAction,
    refresh,
  };
};
