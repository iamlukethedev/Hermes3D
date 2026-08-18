import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { sanitizeStudioSettings, defaultStudioSettings } from "@/lib/studio/settings";
import { StudioSettingsCoordinator } from "@/lib/studio/coordinator";
import { useOfficeFloorRuntimePersistence } from "@/features/office/hooks/useOfficeFloorRuntimePersistence";
import type { FloorId } from "@/lib/office/floors";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";

type HookParams = {
  activeFloorId: FloorId;
  gatewayUrl: string;
  status: GatewayStatus;
  gatewayError: string | null;
  settingsCoordinator: StudioSettingsCoordinator;
};

function makeCoordinator() {
  const createResponse = () => ({
    settings: sanitizeStudioSettings(defaultStudioSettings()),
  });
  const updateSettings = vi.fn(async () => createResponse());
  const fetchSettings = vi.fn(async () => createResponse());
  const coordinator = new StudioSettingsCoordinator({ fetchSettings, updateSettings }, 0);
  return { coordinator, updateSettings };
}

describe("useOfficeFloorRuntimePersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the connecting status to the Hermes floor", async () => {
    const { coordinator, updateSettings } = makeCoordinator();

    renderHook<void, HookParams>((props) => useOfficeFloorRuntimePersistence(props), {
      initialProps: {
        activeFloorId: "hermes" as FloorId,
        gatewayUrl: "ws://hermes:18789",
        status: "connecting" as GatewayStatus,
        gatewayError: null,
        settingsCoordinator: coordinator,
      },
    });

    await act(() => vi.runAllTimersAsync());
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        officeFloors: expect.objectContaining({
          hermes: expect.objectContaining({ status: "connecting" }),
        }),
      }),
    );
  });

  it("does not re-patch when nothing about the runtime changed", async () => {
    const { coordinator, updateSettings } = makeCoordinator();

    const { rerender } = renderHook<void, HookParams>(
      (props) => useOfficeFloorRuntimePersistence(props),
      {
        initialProps: {
          activeFloorId: "hermes" as FloorId,
          gatewayUrl: "ws://hermes:18789",
          status: "connected" as GatewayStatus,
          gatewayError: null,
          settingsCoordinator: coordinator,
        },
      },
    );

    await act(() => vi.runAllTimersAsync());
    updateSettings.mockClear();

    rerender({
      activeFloorId: "hermes" as const,
      gatewayUrl: "ws://hermes:18789",
      status: "connected" as const,
      gatewayError: null,
      settingsCoordinator: coordinator,
    });

    await act(() => vi.runAllTimersAsync());
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("stamps connection errors onto the Hermes floor", async () => {
    const { coordinator, updateSettings } = makeCoordinator();

    const { rerender } = renderHook<void, HookParams>(
      (props) => useOfficeFloorRuntimePersistence(props),
      {
        initialProps: {
          activeFloorId: "hermes" as FloorId,
          gatewayUrl: "ws://hermes:18789",
          status: "connecting" as GatewayStatus,
          gatewayError: null,
          settingsCoordinator: coordinator,
        },
      },
    );

    await act(() => vi.runAllTimersAsync());
    updateSettings.mockClear();

    rerender({
      activeFloorId: "hermes" as const,
      gatewayUrl: "ws://hermes:18789",
      status: "disconnected" as const,
      gatewayError: "ECONNREFUSED",
      settingsCoordinator: coordinator,
    });

    await act(() => vi.runAllTimersAsync());

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        officeFloors: expect.objectContaining({
          hermes: expect.objectContaining({
            status: "error",
            lastErrorMessage: "ECONNREFUSED",
          }),
        }),
      }),
    );
  });

  it("skips the patch entirely when gatewayUrl is empty", async () => {
    const { coordinator, updateSettings } = makeCoordinator();

    renderHook(() =>
      useOfficeFloorRuntimePersistence({
        activeFloorId: "hermes",
        gatewayUrl: "   ",
        status: "disconnected",
        gatewayError: null,
        settingsCoordinator: coordinator,
      }),
    );

    await act(() => vi.runAllTimersAsync());
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
