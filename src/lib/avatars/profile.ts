export type AgentAvatarHairStyle =
  | "short"
  | "parted"
  | "spiky"
  | "bun"
  | "long"
  | "bob"
  | "twin-tails"
  | "ponytail"
  | "long-wave";
export type AgentAvatarTopStyle =
  | "tee"
  | "hoodie"
  | "jacket"
  | "sweater"
  | "shirt"
  | "long-dress"
  | "short-dress";
export type AgentAvatarBottomStyle =
  | "pants"
  | "shorts"
  | "cuffed"
  | "long-skirt"
  | "mini-skirt"
  | "hot-pants";
export type AgentAvatarHatStyle = "none" | "cap" | "beanie";

export type AgentAvatarProfile = {
  version: 1;
  seed: string;
  body: {
    skinTone: string;
  };
  hair: {
    style: AgentAvatarHairStyle;
    color: string;
  };
  clothing: {
    topStyle: AgentAvatarTopStyle;
    topColor: string;
    bottomStyle: AgentAvatarBottomStyle;
    bottomColor: string;
    shoesColor: string;
  };
  accessories: {
    glasses: boolean;
    headset: boolean;
    hatStyle: AgentAvatarHatStyle;
    backpack: boolean;
  };
};

type ColorOption = {
  id: string;
  label: string;
  color: string;
};

type EnumOption<T extends string> = {
  id: T;
  label: string;
};

export const AGENT_AVATAR_SKIN_TONE_OPTIONS: ColorOption[] = [
  { id: "fair", label: "Fair", color: "#f7d7c2" },
  { id: "light", label: "Light", color: "#f4c58a" },
  { id: "warm", label: "Warm", color: "#d8a06e" },
  { id: "tan", label: "Tan", color: "#b7794e" },
  { id: "deep", label: "Deep", color: "#8a5a3b" },
  { id: "rich", label: "Rich", color: "#5d3a24" },
];

export const AGENT_AVATAR_HAIR_STYLE_OPTIONS: EnumOption<AgentAvatarHairStyle>[] = [
  { id: "short", label: "Short" },
  { id: "parted", label: "Parted" },
  { id: "spiky", label: "Spiky" },
  { id: "bun", label: "Bun" },
  { id: "long", label: "Long" },
  { id: "bob", label: "Bob" },
  { id: "twin-tails", label: "Twin tails" },
  { id: "ponytail", label: "Ponytail" },
  { id: "long-wave", label: "Long wave" },
];

export const AGENT_AVATAR_HAIR_COLOR_OPTIONS: ColorOption[] = [
  { id: "ink", label: "Ink", color: "#151515" },
  { id: "espresso", label: "Espresso", color: "#3e2723" },
  { id: "walnut", label: "Walnut", color: "#6b4f3a" },
  { id: "auburn", label: "Auburn", color: "#7b341e" },
  { id: "blonde", label: "Blonde", color: "#d6b56c" },
  { id: "violet", label: "Violet", color: "#7c3aed" },
  { id: "cyan", label: "Cyan", color: "#0891b2" },
  { id: "pink", label: "Pink", color: "#db2777" },
];

export const AGENT_AVATAR_TOP_STYLE_OPTIONS: EnumOption<AgentAvatarTopStyle>[] = [
  { id: "tee", label: "T-shirt" },
  { id: "hoodie", label: "Hoodie" },
  { id: "jacket", label: "Jacket" },
  { id: "sweater", label: "Sweater" },
  { id: "shirt", label: "Y-shirt" },
  { id: "long-dress", label: "Long dress" },
  { id: "short-dress", label: "Short dress" },
];

export const AGENT_AVATAR_BOTTOM_STYLE_OPTIONS: EnumOption<AgentAvatarBottomStyle>[] = [
  { id: "pants", label: "Long pants" },
  { id: "shorts", label: "Shorts" },
  { id: "cuffed", label: "Cuffed" },
  { id: "long-skirt", label: "Long skirt" },
  { id: "mini-skirt", label: "Mini skirt" },
  { id: "hot-pants", label: "Hot" },
];

export const AGENT_AVATAR_HAT_STYLE_OPTIONS: EnumOption<AgentAvatarHatStyle>[] = [
  { id: "none", label: "None" },
  { id: "cap", label: "Cap" },
  { id: "beanie", label: "Beanie" },
];

export const AGENT_AVATAR_CLOTHING_COLOR_OPTIONS: ColorOption[] = [
  { id: "graphite", label: "Graphite", color: "#2d3748" },
  { id: "sky", label: "Sky", color: "#7090ff" },
  { id: "mint", label: "Mint", color: "#34d399" },
  { id: "amber", label: "Amber", color: "#f59e0b" },
  { id: "rose", label: "Rose", color: "#f43f5e" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "cream", label: "Cream", color: "#f5f5f4" },
  { id: "slate", label: "Slate", color: "#64748b" },
];

export const AGENT_AVATAR_SHOE_COLOR_OPTIONS: ColorOption[] = [
  { id: "black", label: "Black", color: "#1a1a1a" },
  { id: "navy", label: "Navy", color: "#1e3a8a" },
  { id: "brown", label: "Brown", color: "#7c4a2d" },
  { id: "white", label: "White", color: "#e5e7eb" },
];

const AGENT_AVATAR_VERSION = 1 as const;

const LEGACY_AGENT_AVATAR_HAIR_STYLES = ["short", "parted", "spiky", "bun"] as const;
const LEGACY_AGENT_AVATAR_TOP_STYLES = ["tee", "hoodie", "jacket"] as const;
const LEGACY_AGENT_AVATAR_BOTTOM_STYLES = ["pants", "shorts", "cuffed"] as const;

export type AgentAvatarFemalePreset = Readonly<{
  id: string;
  label: string;
  hairLabel: string;
  hairStyle: AgentAvatarHairStyle;
  hairColor: string;
  topStyle: AgentAvatarTopStyle;
  topColor: string;
  bottomStyle: AgentAvatarBottomStyle;
  bottomColor: string;
  shoesColor: string;
}>;

export const AGENT_AVATAR_FEMALE_PRESETS: readonly AgentAvatarFemalePreset[] = [
  {
    id: "long-dress",
    label: "Long dress",
    hairLabel: "Long wave",
    hairStyle: "long-wave",
    hairColor: "#3e2723",
    topStyle: "long-dress",
    topColor: "#8b5cf6",
    bottomStyle: "pants",
    bottomColor: "#8b5cf6",
    shoesColor: "#1a1a1a",
  },
  {
    id: "short-dress",
    label: "Short dress",
    hairLabel: "Bob",
    hairStyle: "bob",
    hairColor: "#7b341e",
    topStyle: "short-dress",
    topColor: "#f43f5e",
    bottomStyle: "mini-skirt",
    bottomColor: "#f43f5e",
    shoesColor: "#e5e7eb",
  },
  {
    id: "long-skirt",
    label: "Long skirt",
    hairLabel: "Long",
    hairStyle: "long",
    hairColor: "#151515",
    topStyle: "sweater",
    topColor: "#f5f5f4",
    bottomStyle: "long-skirt",
    bottomColor: "#2d3748",
    shoesColor: "#7c4a2d",
  },
  {
    id: "mini-skirt",
    label: "Mini skirt",
    hairLabel: "Twin tails",
    hairStyle: "twin-tails",
    hairColor: "#db2777",
    topStyle: "shirt",
    topColor: "#f5f5f4",
    bottomStyle: "mini-skirt",
    bottomColor: "#7090ff",
    shoesColor: "#1e3a8a",
  },
  {
    id: "hot",
    label: "Hot",
    hairLabel: "Ponytail",
    hairStyle: "ponytail",
    hairColor: "#6b4f3a",
    topStyle: "tee",
    topColor: "#34d399",
    bottomStyle: "hot-pants",
    bottomColor: "#2d3748",
    shoesColor: "#e5e7eb",
  },
  {
    id: "long-pants",
    label: "Long pants",
    hairLabel: "Bob",
    hairStyle: "bob",
    hairColor: "#d6b56c",
    topStyle: "sweater",
    topColor: "#7090ff",
    bottomStyle: "pants",
    bottomColor: "#64748b",
    shoesColor: "#1a1a1a",
  },
] as const;

export const applyAgentAvatarFemalePreset = (
  profile: AgentAvatarProfile,
  presetId: string,
): AgentAvatarProfile => {
  const preset = AGENT_AVATAR_FEMALE_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return profile;

  return {
    ...profile,
    hair: {
      style: preset.hairStyle,
      color: preset.hairColor,
    },
    clothing: {
      topStyle: preset.topStyle,
      topColor: preset.topColor,
      bottomStyle: preset.bottomStyle,
      bottomColor: preset.bottomColor,
      shoesColor: preset.shoesColor,
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const coerceString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pick = <T,>(values: readonly T[], index: number) => values[index % values.length];

const resolveColor = (value: unknown, options: ColorOption[], fallback: string) => {
  const color = coerceString(value).toLowerCase();
  if (!color) return fallback;
  const option =
    options.find((entry) => entry.id === color) ??
    options.find((entry) => entry.color.toLowerCase() === color);
  return option?.color ?? fallback;
};

const resolveEnumOption = <T extends string>(
  value: unknown,
  options: EnumOption<T>[],
  fallback: T,
): T => {
  const normalized = coerceString(value).toLowerCase();
  const match = options.find((entry) => entry.id === normalized);
  return match?.id ?? fallback;
};

export const createAgentAvatarProfileFromSeed = (seed: string): AgentAvatarProfile => {
  const normalizedSeed = seed.trim() || "agent";
  const hash = hashSeed(normalizedSeed);
  const skinTone = pick(AGENT_AVATAR_SKIN_TONE_OPTIONS, hash).color;
  const hairStyle = pick(LEGACY_AGENT_AVATAR_HAIR_STYLES, hash >>> 3);
  const hairColor = pick(AGENT_AVATAR_HAIR_COLOR_OPTIONS, hash >>> 5).color;
  const topStyle = pick(LEGACY_AGENT_AVATAR_TOP_STYLES, hash >>> 7);
  const topColor = pick(AGENT_AVATAR_CLOTHING_COLOR_OPTIONS, hash >>> 9).color;
  const bottomStyle = pick(LEGACY_AGENT_AVATAR_BOTTOM_STYLES, hash >>> 11);
  const bottomColor = pick(AGENT_AVATAR_CLOTHING_COLOR_OPTIONS, hash >>> 13).color;
  const shoesColor = pick(AGENT_AVATAR_SHOE_COLOR_OPTIONS, hash >>> 15).color;
  const hatStyle = pick(AGENT_AVATAR_HAT_STYLE_OPTIONS, hash >>> 17).id;

  return {
    version: AGENT_AVATAR_VERSION,
    seed: normalizedSeed,
    body: {
      skinTone,
    },
    hair: {
      style: hairStyle,
      color: hairColor,
    },
    clothing: {
      topStyle,
      topColor,
      bottomStyle,
      bottomColor,
      shoesColor,
    },
    accessories: {
      glasses: Boolean((hash >>> 19) % 2),
      headset: Boolean((hash >>> 20) % 2),
      hatStyle,
      backpack: Boolean((hash >>> 21) % 2),
    },
  };
};

export const createDefaultAgentAvatarProfile = (seed: string): AgentAvatarProfile =>
  createAgentAvatarProfileFromSeed(seed);

export const normalizeAgentAvatarProfile = (
  value: unknown,
  fallbackSeed: string,
): AgentAvatarProfile => {
  if (typeof value === "string") {
    return createAgentAvatarProfileFromSeed(value);
  }

  const baseProfile = createAgentAvatarProfileFromSeed(fallbackSeed);
  if (!isRecord(value)) {
    return baseProfile;
  }

  const body = isRecord(value.body) ? value.body : {};
  const hair = isRecord(value.hair) ? value.hair : {};
  const clothing = isRecord(value.clothing) ? value.clothing : {};
  const accessories = isRecord(value.accessories) ? value.accessories : {};
  const normalizedSeed = coerceString(value.seed) || baseProfile.seed;

  return {
    version: AGENT_AVATAR_VERSION,
    seed: normalizedSeed,
    body: {
      skinTone: resolveColor(
        body.skinTone,
        AGENT_AVATAR_SKIN_TONE_OPTIONS,
        baseProfile.body.skinTone,
      ),
    },
    hair: {
      style: resolveEnumOption(
        hair.style,
        AGENT_AVATAR_HAIR_STYLE_OPTIONS,
        baseProfile.hair.style,
      ),
      color: resolveColor(
        hair.color,
        AGENT_AVATAR_HAIR_COLOR_OPTIONS,
        baseProfile.hair.color,
      ),
    },
    clothing: {
      topStyle: resolveEnumOption(
        clothing.topStyle,
        AGENT_AVATAR_TOP_STYLE_OPTIONS,
        baseProfile.clothing.topStyle,
      ),
      topColor: resolveColor(
        clothing.topColor,
        AGENT_AVATAR_CLOTHING_COLOR_OPTIONS,
        baseProfile.clothing.topColor,
      ),
      bottomStyle: resolveEnumOption(
        clothing.bottomStyle,
        AGENT_AVATAR_BOTTOM_STYLE_OPTIONS,
        baseProfile.clothing.bottomStyle,
      ),
      bottomColor: resolveColor(
        clothing.bottomColor,
        AGENT_AVATAR_CLOTHING_COLOR_OPTIONS,
        baseProfile.clothing.bottomColor,
      ),
      shoesColor: resolveColor(
        clothing.shoesColor,
        AGENT_AVATAR_SHOE_COLOR_OPTIONS,
        baseProfile.clothing.shoesColor,
      ),
    },
    accessories: {
      glasses:
        typeof accessories.glasses === "boolean"
          ? accessories.glasses
          : baseProfile.accessories.glasses,
      headset:
        typeof accessories.headset === "boolean"
          ? accessories.headset
          : baseProfile.accessories.headset,
      hatStyle: resolveEnumOption(
        accessories.hatStyle,
        AGENT_AVATAR_HAT_STYLE_OPTIONS,
        baseProfile.accessories.hatStyle,
      ),
      backpack:
        typeof accessories.backpack === "boolean"
          ? accessories.backpack
          : baseProfile.accessories.backpack,
    },
  };
};
