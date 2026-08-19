import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GatewayConnectScreen } from "@/features/agents/components/GatewayConnectScreen";

const renderScreen = (gatewayUrl: string) =>
  render(
    createElement(GatewayConnectScreen, {
      gatewayUrl,
      token: "",
      selectedAdapterType: "hermes" as const,
      activeAdapterType: "hermes" as const,
      localGatewayDefaults: null,
      status: "disconnected" as const,
      error: null,
      onGatewayUrlChange: vi.fn(),
      onTokenChange: vi.fn(),
      onAdapterTypeChange: vi.fn(),
      onUseLocalDefaults: vi.fn(),
      onConnect: vi.fn(),
    }),
  );

describe("GatewayConnectScreen upstream URL findings", () => {
  afterEach(() => {
    cleanup();
  });

  it("warns before connecting when pointed at the hermes-agent dashboard port", () => {
    renderScreen("wss://luke-hermes.taildb786a.ts.net:9119");

    const dashboardFinding = screen.getByTestId("gateway-url-finding-hermes_agent_dashboard_port");
    expect(dashboardFinding.textContent).toMatch(/JSON-RPC 2\.0/);
    expect(dashboardFinding.textContent).toMatch(/npm run hermes-adapter/);
    expect(screen.getByTestId("gateway-url-finding-tls_on_plain_tailnet_port")).toBeTruthy();
  });

  it("stays quiet for a valid adapter URL", () => {
    renderScreen("wss://luke-hermes.taildb786a.ts.net");

    expect(screen.queryByLabelText("Gateway URL warnings")).toBeNull();
  });
});
