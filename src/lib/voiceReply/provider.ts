export type VoiceReplyProvider = "elevenlabs" | "minimax";

export type VoiceReplySynthesisRequest = {
  text: string;
  provider?: VoiceReplyProvider;
  voiceId?: string | null;
  speed?: number;
};

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_REPLY_PROVIDER: VoiceReplyProvider = "elevenlabs";
const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_ELEVENLABS_MODEL_ID =
  process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
const MINIMAX_API_URLS = {
  global_en: "https://api.minimax.io/v1/t2a_v2",
  cn_zh: "https://api.minimaxi.com/v1/t2a_v2",
} as const;
const DEFAULT_MINIMAX_MODEL_ID = "speech-2.8-hd";

type MinimaxApiRegion = keyof typeof MINIMAX_API_URLS;

type MinimaxSpeechResponse = {
  data?: {
    audio?: string;
  };
  base_resp?: {
    status_code?: number;
  };
};

const normalizeVoiceSpeed = (value: number | null | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(1.2, Math.max(0.7, value));
};

const normalizeVoiceId = (value: string | null | undefined): string => {
  const explicit = value?.trim();
  if (explicit) return explicit;
  const fromEnv = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_ELEVENLABS_VOICE_ID;
};

const synthesizeWithElevenLabs = async (
  request: VoiceReplySynthesisRequest
): Promise<Response> => {
  // TODO: Create Hermes3D voice and text skill.
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY.");
  }
  const voiceId = normalizeVoiceId(request.voiceId);
  const speed = normalizeVoiceSpeed(request.speed);
  const response = await fetch(
    `${ELEVENLABS_API_URL}/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: request.text,
        model_id: DEFAULT_ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.88,
          style: 0.2,
          use_speaker_boost: true,
          speed,
        },
      }),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(detail || "ElevenLabs voice synthesis failed.");
  }
  return response;
};

const resolveMinimaxApiUrl = (): string => {
  const region = process.env.MINIMAX_API_REGION?.trim() || "global_en";
  if (!(region in MINIMAX_API_URLS)) {
    throw new Error(`Unsupported MINIMAX_API_REGION: ${region}.`);
  }
  return MINIMAX_API_URLS[region as MinimaxApiRegion];
};

const synthesizeWithMinimax = async (
  request: VoiceReplySynthesisRequest
): Promise<Response> => {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing MINIMAX_API_KEY.");
  }
  const model = process.env.MINIMAX_MODEL_ID?.trim() || DEFAULT_MINIMAX_MODEL_ID;
  const response = await fetch(resolveMinimaxApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      text: request.text,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(detail || "MiniMax voice synthesis failed.");
  }
  const payload = (await response.json()) as MinimaxSpeechResponse;
  if (payload.base_resp?.status_code && payload.base_resp.status_code !== 0) {
    throw new Error("MiniMax voice synthesis failed.");
  }
  const audio = payload.data?.audio?.trim() || "";
  if (!audio || audio.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(audio)) {
    throw new Error("MiniMax voice synthesis returned invalid audio data.");
  }
  return new Response(Buffer.from(audio, "hex"), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "audio/mpeg",
    },
  });
};

export const synthesizeVoiceReply = async (
  request: VoiceReplySynthesisRequest
): Promise<Response> => {
  const provider = request.provider ?? DEFAULT_VOICE_REPLY_PROVIDER;
  switch (provider) {
    case "elevenlabs":
      return synthesizeWithElevenLabs(request);
    case "minimax":
      return synthesizeWithMinimax(request);
    default:
      throw new Error("Unsupported voice reply provider.");
  }
};
