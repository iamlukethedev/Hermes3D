import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const loadProvider = async () => {
  vi.resetModules();
  return import("@/lib/voiceReply/provider");
};

describe("MiniMax voice reply provider", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MINIMAX_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sends the configured model and text to the global speech endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: { audio: "494433" },
        base_resp: { status_code: 0 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { synthesizeVoiceReply } = await loadProvider();

    const response = await synthesizeVoiceReply({
      provider: "minimax",
      text: "Hello from Hermes3D.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.minimax.io/v1/t2a_v2",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "speech-2.8-hd",
          text: "Hello from Hermes3D.",
        }),
      })
    );
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("494433", "hex"));
  });

  it("uses the China speech endpoint when that region is configured", async () => {
    process.env.MINIMAX_API_REGION = "cn_zh";
    process.env.MINIMAX_MODEL_ID = "speech-2.8-turbo";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: { audio: "52494646" },
        base_resp: { status_code: 0 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { synthesizeVoiceReply } = await loadProvider();

    await synthesizeVoiceReply({
      provider: "minimax",
      text: "Regional endpoint check.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.minimaxi.com/v1/t2a_v2",
      expect.objectContaining({
        body: JSON.stringify({
          model: "speech-2.8-turbo",
          text: "Regional endpoint check.",
        }),
      })
    );
  });

  it("rejects malformed audio data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: { audio: "not-hex" },
          base_resp: { status_code: 0 },
        })
      )
    );
    const { synthesizeVoiceReply } = await loadProvider();

    await expect(
      synthesizeVoiceReply({
        provider: "minimax",
        text: "Invalid response check.",
      })
    ).rejects.toThrow("invalid audio data");
  });
});
