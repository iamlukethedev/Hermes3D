import { describe, expect, it } from "vitest";

import {
  AGENT_AVATAR_FEMALE_PRESETS,
  applyAgentAvatarFemalePreset,
  createDefaultAgentAvatarProfile,
  normalizeAgentAvatarProfile,
} from "@/lib/avatars/profile";

describe("female avatar presets", () => {
  it("defines the six requested outfits and five requested hairstyles", () => {
    expect(AGENT_AVATAR_FEMALE_PRESETS).toHaveLength(6);

    const outfits = AGENT_AVATAR_FEMALE_PRESETS.map((preset) =>
      preset.topStyle === "long-dress" || preset.topStyle === "short-dress"
        ? preset.topStyle
        : preset.bottomStyle,
    );
    expect(new Set(outfits)).toEqual(
      new Set([
        "long-dress",
        "short-dress",
        "long-skirt",
        "mini-skirt",
        "hot-pants",
        "pants",
      ]),
    );
    expect(new Set(AGENT_AVATAR_FEMALE_PRESETS.map((preset) => preset.hairStyle))).toEqual(
      new Set(["long", "bob", "twin-tails", "ponytail", "long-wave"]),
    );
  });

  it("applies hair and clothing without replacing identity or accessories", () => {
    const current = createDefaultAgentAvatarProfile("agent-1");
    const applied = applyAgentAvatarFemalePreset(current, "hot");

    expect(applied).not.toBe(current);
    expect(applied.seed).toBe(current.seed);
    expect(applied.body).toEqual(current.body);
    expect(applied.accessories).toEqual(current.accessories);
    expect(applied.hair.style).toBe("ponytail");
    expect(applied.clothing.topStyle).toBe("tee");
    expect(applied.clothing.bottomStyle).toBe("hot-pants");
    expect(normalizeAgentAvatarProfile(applied, "fallback")).toEqual(applied);
  });

  it("keeps legacy seed-generated appearances stable", () => {
    expect(createDefaultAgentAvatarProfile("seed-a")).toEqual({
      version: 1,
      seed: "seed-a",
      body: { skinTone: "#f7d7c2" },
      hair: { style: "spiky", color: "#7b341e" },
      clothing: {
        topStyle: "hoodie",
        topColor: "#2d3748",
        bottomStyle: "shorts",
        bottomColor: "#f59e0b",
        shoesColor: "#1a1a1a",
      },
      accessories: {
        glasses: false,
        headset: true,
        hatStyle: "cap",
        backpack: true,
      },
    });
  });
});
