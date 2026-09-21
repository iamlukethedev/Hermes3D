const FLEET_SESSION_HEADER = "x-hermes3d-fleet-session";

export type FleetRequestAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; error: string };

export const authorizeFleetRequest = (request: Request): FleetRequestAuthorization => {
  if (!process.env.HERMES_DASHBOARD_SESSION_TOKEN?.trim()) {
    return {
      ok: false,
      status: 503,
      error: "The Hermes3D dashboard session is not configured.",
    };
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return { ok: false, status: 403, error: "Cross-origin fleet access is forbidden." };
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return { ok: false, status: 403, error: "Cross-site fleet access is forbidden." };
  }
  if (request.headers.get(FLEET_SESSION_HEADER) !== "1") {
    return { ok: false, status: 401, error: "Fleet session header is required." };
  }
  return { ok: true };
};

export const fleetSessionHeaders = { [FLEET_SESSION_HEADER]: "1" } as const;
