import type Phaser from "phaser";

import type { OfficeSceneBridge } from "@/features/office/phaser/OfficeSceneBridge";

type OfficeBuilderRenderable =
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Image;

export const createOfficeBuilderScene = (params: {
  PhaserLib: typeof import("phaser");
  bridge: OfficeSceneBridge;
  onObjectMoved?: (id: string, x: number, y: number) => void;
  onSelectionChange?: (ids: string[]) => void;
}): Phaser.Scene => {
  const { PhaserLib, bridge, onObjectMoved, onSelectionChange } = params;

  class BuilderScene extends PhaserLib.Scene {
    private unsubscribe: (() => void) | null = null;
    private layer = new Map<string, OfficeBuilderRenderable>();
    private selected = new Set<string>();
    private dragId: string | null = null;

    constructor() {
      super("office-builder-scene");
    }

    create() {
      this.cameras.main.setBackgroundColor("#0f1a26");
      this.unsubscribe = bridge.subscribe(() => {
        this.renderMap();
      });
      this.renderMap();
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const target = this.pickObject(pointer.worldX, pointer.worldY);
        const shiftPressed = Boolean(
          pointer.event &&
          typeof pointer.event === "object" &&
          "shiftKey" in pointer.event &&
          (pointer.event as { shiftKey?: unknown }).shiftKey === true,
        );
        if (!target) {
          this.selected.clear();
          onSelectionChange?.([]);
          return;
        }
        if (shiftPressed) {
          if (this.selected.has(target.id)) {
            this.selected.delete(target.id);
          } else {
            this.selected.add(target.id);
          }
        } else {
          this.selected.clear();
          this.selected.add(target.id);
        }
        this.dragId = target.id;
        onSelectionChange?.([...this.selected]);
        this.renderMap();
      });
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown || !this.dragId) return;
        const nextX = Math.round(pointer.worldX / 16) * 16;
        const nextY = Math.round(pointer.worldY / 16) * 16;
        onObjectMoved?.(this.dragId, nextX, nextY);
      });
      this.input.on("pointerup", () => {
        this.dragId = null;
      });
    }

    shutdown() {
      this.unsubscribe?.();
      this.unsubscribe = null;
      for (const item of this.layer.values()) {
        item.destroy();
      }
      this.layer.clear();
      this.selected.clear();
    }

    private renderMap() {
      const state = bridge.getState();
      const keep = new Set<string>();
      for (const object of state.map.objects) {
        keep.add(object.id);
        const existing = this.layer.get(object.id);
        if (existing) {
          // Cast to common interface for transform
          const transform =
            existing as unknown as Phaser.GameObjects.Components.Transform;
          transform.setPosition(object.x, object.y);
          transform.setAngle(object.rotation);

          if (
            existing instanceof PhaserLib.GameObjects.Rectangle &&
            (existing as any).geom
          ) {
            try {
              existing.setSize(32, 32);
              existing.setStrokeStyle(
                this.selected.has(object.id) ? 2 : 0,
                0x79e5ff,
                1,
              );
              existing.setFillStyle(0x4f80af, 0.95);
            } catch {}
          } else if (existing instanceof PhaserLib.GameObjects.Image) {
            existing.setAlpha(this.selected.has(object.id) ? 0.8 : 1);
          }
          continue;
        }

        let sprite: OfficeBuilderRenderable;
        if (object.assetId === "office_bg") {
          const img = this.add.image(object.x, object.y, "office_bg");
          img.setOrigin(0.5, 0.5);
          sprite = img;
        } else {
          const rect = this.add.rectangle(
            object.x,
            object.y,
            32,
            32,
            0x4f80af,
            0.95,
          );
          rect.setOrigin(0.5, 0.5);
          sprite = rect;
        }

        sprite.setDepth(object.zIndex);
        this.layer.set(object.id, sprite);
      }
      for (const [id, item] of this.layer) {
        if (keep.has(id)) continue;
        item.destroy();
        this.layer.delete(id);
      }
    }

    private pickObject(x: number, y: number) {
      const map = bridge.getState().map;
      for (let index = map.objects.length - 1; index >= 0; index -= 1) {
        const object = map.objects[index];
        if (Math.abs(x - object.x) <= 16 && Math.abs(y - object.y) <= 16) {
          return object;
        }
      }
      return null;
    }
  }

  return new BuilderScene();
};
