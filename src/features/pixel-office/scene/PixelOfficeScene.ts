// The Gather-style Phaser scene: renders the pixel office map, animates
// agents from the simulation, and forwards clicks back to React.

import type Phaser from "phaser";

import {
  buildCharacterFrames,
  buildFurnitureSprites,
  buildGroundTileSprites,
  JANITOR_LOOK,
  paintSpriteToContext,
  spriteHeight,
  spriteWidth,
} from "@/features/pixel-office/art";
import type { PixelSceneBridge } from "@/features/pixel-office/PixelSceneBridge";
import {
  createPixelSimulation,
  JANITOR_ID,
  type PixelSimulation,
} from "@/features/pixel-office/sim/agentSimulation";
import {
  CHARACTER_HEIGHT,
  OBJECT_FOOTPRINT,
  PIXEL_TILE_SIZE,
  type CharacterFrameName,
  type PixelAgentPose,
  type PixelFacing,
  type PixelOfficeMap,
  type PixelSprite,
  type PixelStationKind,
} from "@/features/pixel-office/types";

const TILE = PIXEL_TILE_SIZE;

const STATUS_DOT_COLOR: Record<string, number> = {
  working: 0x4ade80,
  idle: 0xfbbf24,
  error: 0xef4444,
};

/** Station kinds where an arrived agent reads as seated. */
const SEATED_STATION_KINDS: ReadonlySet<PixelStationKind> = new Set([
  "lounge_seat",
  "library",
  "meeting_seat",
]);

const WALK_FRAME_MS = 140;
const DANCE_FRAME_MS = 260;

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;

/** World-space radius around an agent's body that accepts clicks. */
const AGENT_CLICK_RADIUS = 28;

type AgentVisual = {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  overlay: Phaser.GameObjects.Container;
  nameBg: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  statusDot: Phaser.GameObjects.Arc;
  bubbleBg: Phaser.GameObjects.Graphics;
  bubbleText: Phaser.GameObjects.Text;
  thinkText: Phaser.GameObjects.Text;
  badgeText: Phaser.GameObjects.Text;
  lastBubble: string;
  lingerText: string;
  bubbleChangedAt: number;
  lastStatus: string;
  lastName: string;
  seed: string;
};

/** How long a finished speech bubble stays readable, in ms. */
const BUBBLE_LINGER_MS = 3_000;

export const createPixelOfficeScene = (params: {
  PhaserLib: typeof import("phaser");
  bridge: PixelSceneBridge;
  map: PixelOfficeMap;
}): Phaser.Scene => {
  const { PhaserLib, bridge, map } = params;
  const worldWidth = map.cols * TILE;
  const worldHeight = map.rows * TILE;

  class PixelOfficeScene extends PhaserLib.Scene {
    private sim: PixelSimulation | null = null;
    private visuals = new Map<string, AgentVisual>();
    private frameSetReady = new Set<string>();
    private animClock = 0;
    private dragStart: { x: number; y: number; sx: number; sy: number } | null = null;
    private dragDistance = 0;

    constructor() {
      super("pixel-office-scene");
    }

    create() {
      this.sim = createPixelSimulation(map);
      this.registerSprites([...buildGroundTileSprites(), ...buildFurnitureSprites()]);
      this.renderGround();
      this.renderFurniture();
      this.renderZoneLabels();
      this.setupCamera();
      this.setupPointerControls();
      this.events.once(PhaserLib.Scenes.Events.SHUTDOWN, () => {
        this.visuals.clear();
        this.sim = null;
      });
    }

    update(_time: number, delta: number) {
      if (!this.sim) return;
      this.animClock += delta;
      const state = bridge.getState();
      const poses = this.sim.tick({
        inputs: state.agents,
        nowMs: Date.now(),
        dtMs: delta,
        cleaningActive: state.cleaningActive,
      });
      this.syncAgents(poses);
    }

    // -------------------------------------------------------------------
    // Texture helpers.
    // -------------------------------------------------------------------

    private registerSprites(sprites: PixelSprite[]) {
      for (const sprite of sprites) {
        if (this.textures.exists(sprite.key)) continue;
        const width = spriteWidth(sprite);
        const height = spriteHeight(sprite);
        const canvasTexture = this.textures.createCanvas(sprite.key, width, height);
        if (!canvasTexture) continue;
        const context = canvasTexture.getContext();
        paintSpriteToContext(sprite, context, 0, 0);
        canvasTexture.refresh();
      }
    }

    private ensureCharacterTextures(seed: string, accentColor: string) {
      if (this.frameSetReady.has(seed)) return;
      const look = seed === JANITOR_ID ? JANITOR_LOOK : { seed, accentColor };
      const frames = buildCharacterFrames(look);
      this.registerSprites(Object.values(frames));
      this.frameSetReady.add(seed);
    }

    // -------------------------------------------------------------------
    // Static world rendering.
    // -------------------------------------------------------------------

    private renderGround() {
      const rt = this.add.renderTexture(0, 0, worldWidth, worldHeight);
      rt.setOrigin(0, 0);
      rt.setDepth(0);
      rt.beginDraw();
      for (let ty = 0; ty < map.rows; ty += 1) {
        for (let tx = 0; tx < map.cols; tx += 1) {
          const tile = map.ground[ty * map.cols + tx];
          if (tile === "void") continue;
          const altKey = `tile_${tile}_alt`;
          const useAlt =
            this.textures.exists(altKey) && ((tx * 7 + ty * 13 + tx * ty) % 5 === 0);
          const key = useAlt ? altKey : `tile_${tile}`;
          if (!this.textures.exists(key)) continue;
          rt.batchDraw(key, tx * TILE, ty * TILE);
        }
      }
      rt.endDraw();
    }

    private renderFurniture() {
      for (const object of map.objects) {
        const key = `furn_${object.kind}`;
        if (!this.textures.exists(key)) continue;
        const [, fh] = OBJECT_FOOTPRINT[object.kind];
        const bottomY = (object.ty + fh) * TILE;
        const image = this.add.image(object.tx * TILE, bottomY, key);
        image.setOrigin(0, 1);
        // Flat decor stays under everything that walks over it.
        const flat = object.kind === "rug" || object.kind === "flower";
        image.setDepth(flat ? 1 : bottomY);
        if (object.kind === "jukebox" || object.kind === "kanban_board") {
          const stationKind = object.kind === "jukebox" ? "jukebox" : "kanban";
          image.setInteractive({ useHandCursor: true });
          image.on("pointerover", () => image.setTint(0xbfe8ff));
          image.on("pointerout", () => image.clearTint());
          image.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (this.dragDistance > 6) return;
            if (pointer.rightButtonReleased()) return;
            bridge.callbacks.onStationInteract?.(stationKind);
          });
        }
      }
    }

    private renderZoneLabels() {
      for (const zoneEntry of map.zones) {
        if (!zoneEntry.label) continue;
        const centerX = (zoneEntry.tx + zoneEntry.tw / 2) * TILE;
        const topY = zoneEntry.ty * TILE + 44;
        const text = this.add.text(0, 0, zoneEntry.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#5b5346",
        });
        text.setResolution(4);
        text.setOrigin(0.5, 0.5);
        const paddingX = 11;
        const paddingY = 5;
        const bg = this.add.graphics();
        bg.fillStyle(0xf7f1e3, 0.92);
        bg.fillRoundedRect(
          -text.width / 2 - paddingX,
          -text.height / 2 - paddingY,
          text.width + paddingX * 2,
          text.height + paddingY * 2,
          5,
        );
        const container = this.add.container(centerX, topY, [bg, text]);
        container.setDepth(45_000);
        container.setAlpha(0.95);
      }
    }

    // -------------------------------------------------------------------
    // Camera + input.
    // -------------------------------------------------------------------

    /** Zoom at which the whole map (plus a margin) fits the viewport. */
    private containZoom(): number {
      return Math.min(
        this.scale.width / (worldWidth + TILE * 2),
        this.scale.height / (worldHeight + TILE * 2),
      );
    }

    /** Lowest allowed zoom: never smaller than "whole map in view". */
    private minZoom(): number {
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.containZoom()));
    }

    private setupCamera() {
      const camera = this.cameras.main;
      // Bounds are at least as large as the viewport at minimum zoom and
      // centered on the map, so a fully zoomed-out map sits centered with
      // symmetric grass margins instead of pinned to a corner.
      const minZoom = this.minZoom();
      const boundsW = Math.max(worldWidth + TILE * 4, this.scale.width / minZoom);
      const boundsH = Math.max(worldHeight + TILE * 4, this.scale.height / minZoom);
      camera.setBounds(
        worldWidth / 2 - boundsW / 2,
        worldHeight / 2 - boundsH / 2,
        boundsW,
        boundsH,
      );
      camera.setRoundPixels(true);
      // Gather-style default: start close enough that the pixel art reads at
      // 1:1+ detail, centered on the main pods. Wheel out for the overview.
      const zoom = PhaserLib.Math.Clamp(
        Math.max(0.75, Math.floor(this.containZoom() * 4) / 4),
        this.minZoom(),
        MAX_ZOOM,
      );
      camera.setZoom(zoom);
      camera.centerOn(worldWidth / 2, worldHeight * 0.42);
    }

    private setupPointerControls() {
      this.input.mouse?.disableContextMenu();
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.dragStart = {
          x: pointer.x,
          y: pointer.y,
          sx: this.cameras.main.scrollX,
          sy: this.cameras.main.scrollY,
        };
        this.dragDistance = 0;
      });
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown || !this.dragStart) return;
        const camera = this.cameras.main;
        const dx = pointer.x - this.dragStart.x;
        const dy = pointer.y - this.dragStart.y;
        this.dragDistance = Math.max(this.dragDistance, Math.hypot(dx, dy));
        camera.setScroll(
          this.dragStart.sx - dx / camera.zoom,
          this.dragStart.sy - dy / camera.zoom,
        );
      });
      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const wasDrag = this.dragDistance > 6;
        this.dragStart = null;
        if (wasDrag) return;
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const agentId = this.pickAgentAt(world.x, world.y);
        if (!agentId) return;
        if (pointer.rightButtonReleased()) {
          const nativeEvent = pointer.event as MouseEvent;
          bridge.callbacks.onAgentContextMenu?.(
            agentId,
            nativeEvent.clientX ?? 0,
            nativeEvent.clientY ?? 0,
          );
          return;
        }
        if (agentId === JANITOR_ID) return;
        const visual = this.visuals.get(agentId);
        if (visual) {
          this.cameras.main.pan(
            visual.container.x,
            visual.container.y,
            350,
            "Sine.easeInOut",
          );
        }
        bridge.callbacks.onAgentClick?.(agentId);
      });
      this.input.on(
        "wheel",
        (
          _pointer: Phaser.Input.Pointer,
          _objects: unknown[],
          _deltaX: number,
          deltaY: number,
        ) => {
          const camera = this.cameras.main;
          const step = deltaY > 0 ? -0.25 : 0.25;
          const next = PhaserLib.Math.Clamp(camera.zoom + step, this.minZoom(), MAX_ZOOM);
          camera.setZoom(next);
        },
      );
    }

    // -------------------------------------------------------------------
    // Agents.
    // -------------------------------------------------------------------

    /** Returns the id of the agent whose body is nearest to a world point. */
    private pickAgentAt(worldX: number, worldY: number): string | null {
      let bestId: string | null = null;
      let bestDistance = AGENT_CLICK_RADIUS;
      for (const [id, visual] of this.visuals) {
        // The clickable center sits mid-body, above the feet anchor.
        const bodyX = visual.container.x;
        const bodyY = visual.container.y - CHARACTER_HEIGHT / 2;
        const distance = Math.hypot(worldX - bodyX, worldY - bodyY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = id;
        }
      }
      return bestId;
    }

    private syncAgents(poses: PixelAgentPose[]) {
      const state = bridge.getState();
      const inputById = new Map(state.agents.map((agent) => [agent.id, agent]));
      const seen = new Set<string>();

      for (const pose of poses) {
        seen.add(pose.id);
        const input = inputById.get(pose.id) ?? null;
        const accent = input?.color ?? "#8a8f98";
        this.ensureCharacterTextures(pose.id, accent);
        let visual = this.visuals.get(pose.id);
        if (!visual) {
          visual = this.createVisual(pose.id, input?.name ?? "Janitor");
          this.visuals.set(pose.id, visual);
        }
        this.updateVisual(visual, pose, input, state.bubbleTextByAgentId[pose.id] ?? "");
      }

      for (const [id, visual] of this.visuals) {
        if (seen.has(id)) continue;
        visual.container.destroy();
        visual.overlay.destroy();
        this.visuals.delete(id);
      }
    }

    private createVisual(id: string, name: string): AgentVisual {
      const shadow = this.add.ellipse(0, -2, 30, 11, 0x000000, 0.2);
      const sprite = this.add.image(0, 0, `char_${id}_idle_down`);
      sprite.setOrigin(0.5, 1);
      // Clicks are resolved scene-wide via pickAgentAt (more forgiving for
      // small moving targets); the sprite is interactive for hover feedback.
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerover", () => sprite.setTint(0xd9f1ff));
      sprite.on("pointerout", () => sprite.clearTint());
      const container = this.add.container(0, 0, [shadow, sprite]);

      const nameBg = this.add.graphics();
      const nameText = this.add.text(0, 0, name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#f4f7ff",
        fontStyle: "bold",
      });
      nameText.setResolution(4);
      nameText.setOrigin(0.5, 0.5);
      const statusDot = this.add.circle(0, 0, 4, 0x4ade80);
      const bubbleBg = this.add.graphics();
      const bubbleText = this.add.text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#2b2b3a",
        align: "left",
        wordWrap: { width: 170 },
      });
      bubbleText.setResolution(4);
      bubbleText.setOrigin(0.5, 1);
      const thinkText = this.add.text(0, 0, "…", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#2b2b3a",
        backgroundColor: "#f4f7ff",
        padding: { left: 6, right: 6, top: 0, bottom: 2 },
      });
      thinkText.setResolution(4);
      thinkText.setOrigin(0.5, 1);
      const badgeText = this.add.text(0, 0, "!", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#1f1303",
        fontStyle: "bold",
        backgroundColor: "#fbbf24",
        padding: { left: 6, right: 6, top: 0, bottom: 2 },
      });
      badgeText.setResolution(4);
      badgeText.setOrigin(0.5, 1);
      const overlay = this.add.container(0, 0, [
        nameBg,
        nameText,
        statusDot,
        bubbleBg,
        bubbleText,
        thinkText,
        badgeText,
      ]);
      overlay.setDepth(40_000);

      return {
        container,
        sprite,
        shadow,
        overlay,
        nameBg,
        nameText,
        statusDot,
        bubbleBg,
        bubbleText,
        thinkText,
        badgeText,
        lastBubble: "",
        lingerText: "",
        bubbleChangedAt: -BUBBLE_LINGER_MS,
        lastStatus: "",
        lastName: name,
        seed: id,
      };
    }

    private frameFor(pose: PixelAgentPose): CharacterFrameName {
      const facing: PixelFacing = pose.facing;
      if (pose.activity === "dancing") {
        return Math.floor(this.animClock / DANCE_FRAME_MS) % 2 === 0 ? "dance_a" : "dance_b";
      }
      if (pose.moving) {
        const step = Math.floor(this.animClock / WALK_FRAME_MS) % 4;
        if (step === 0) return `walk_${facing}_a` as CharacterFrameName;
        if (step === 2) return `walk_${facing}_b` as CharacterFrameName;
        return `idle_${facing}` as CharacterFrameName;
      }
      if (pose.activity === "sitting_desk" || pose.activity === "meeting") {
        return `sit_${facing}` as CharacterFrameName;
      }
      if (pose.activity === "station" && pose.stationId) {
        const stationEntry = map.stations.find((entry) => entry.id === pose.stationId);
        if (stationEntry && SEATED_STATION_KINDS.has(stationEntry.kind)) {
          return `sit_${facing}` as CharacterFrameName;
        }
      }
      return `idle_${facing}` as CharacterFrameName;
    }

    private updateVisual(
      visual: AgentVisual,
      pose: PixelAgentPose,
      input: { name: string; status: string; thinking: boolean; awaitingApproval: boolean } | null,
      bubble: string,
    ) {
      visual.container.setPosition(pose.x, pose.y + TILE / 2 - 1);
      visual.container.setDepth(pose.y + TILE / 2);
      const frameKey = `char_${visual.seed}_${this.frameFor(pose)}`;
      if (this.textures.exists(frameKey) && visual.sprite.texture.key !== frameKey) {
        visual.sprite.setTexture(frameKey);
      }

      const overlayY = pose.y + TILE / 2 - CHARACTER_HEIGHT - 8;
      visual.overlay.setPosition(pose.x, overlayY);

      // Nameplate pill with the status dot.
      const name = input?.name ?? "Janitor";
      const status = input?.status ?? "idle";
      if (name !== visual.lastName || status !== visual.lastStatus) {
        visual.lastName = name;
        visual.lastStatus = status;
        visual.nameText.setText(name.length > 16 ? `${name.slice(0, 15)}…` : name);
      }
      const plateWidth = visual.nameText.width + 26;
      const plateHeight = 20;
      visual.nameBg.clear();
      visual.nameBg.fillStyle(0x11131c, 0.82);
      visual.nameBg.fillRoundedRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 8);
      visual.nameText.setPosition(5, 0);
      visual.statusDot.setPosition(-plateWidth / 2 + 9, 0);
      visual.statusDot.setFillStyle(STATUS_DOT_COLOR[status] ?? 0x9ca3af);
      if (status === "working") {
        visual.statusDot.setAlpha(0.6 + 0.4 * Math.abs(Math.sin(this.animClock / 400)));
      } else {
        visual.statusDot.setAlpha(1);
      }

      // Speech bubble (streaming text tail) with a short linger after the
      // stream finishes so quick replies stay readable.
      const bubbleTail = bubble.trim().length > 0 ? tailOf(bubble, 110) : "";
      if (bubbleTail !== visual.lastBubble) {
        visual.lastBubble = bubbleTail;
        if (bubbleTail.length > 0) {
          visual.lingerText = bubbleTail;
          visual.bubbleChangedAt = this.animClock;
          visual.bubbleText.setText(bubbleTail);
        }
      }
      const lingering =
        visual.lingerText.length > 0 &&
        this.animClock - visual.bubbleChangedAt < BUBBLE_LINGER_MS;
      const showBubble = bubbleTail.length > 0 || lingering;
      visual.bubbleBg.setVisible(showBubble);
      visual.bubbleText.setVisible(showBubble);
      if (showBubble) {
        const bw = visual.bubbleText.width + 18;
        const bh = visual.bubbleText.height + 14;
        const by = -14;
        visual.bubbleText.setPosition(0, by - 7);
        visual.bubbleBg.clear();
        visual.bubbleBg.fillStyle(0xf9fbff, 0.96);
        visual.bubbleBg.lineStyle(2, 0x2b2b3a, 0.9);
        visual.bubbleBg.fillRoundedRect(-bw / 2, by - bh, bw, bh, 7);
        visual.bubbleBg.strokeRoundedRect(-bw / 2, by - bh, bw, bh, 7);
        visual.bubbleBg.fillTriangle(-6, by, 6, by, 0, by + 7);
      }

      // Thinking dots (hidden while a speech bubble is visible).
      const thinking = Boolean(input?.thinking) && !showBubble;
      visual.thinkText.setVisible(thinking);
      if (thinking) {
        const dots = 1 + (Math.floor(this.animClock / 350) % 3);
        visual.thinkText.setText(".".repeat(dots));
        visual.thinkText.setPosition(20, -14);
      }

      // Approval badge.
      const approval = Boolean(input?.awaitingApproval);
      visual.badgeText.setVisible(approval);
      if (approval) {
        visual.badgeText.setPosition(-22, -14);
        visual.badgeText.setAlpha(0.75 + 0.25 * Math.sin(this.animClock / 250));
      }
    }
  }

  return new PixelOfficeScene();
};

const tailOf = (value: string, max: number): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `…${compact.slice(compact.length - max)}`;
};
