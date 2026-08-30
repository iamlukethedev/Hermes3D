import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { createDefaultAgentAvatarProfile } from "@/lib/avatars/profile";
import {
  AGENT_SCALE,
  WALK_ANIM_SPEED,
} from "@/features/retro-office/core/constants";
import { toWorld } from "@/features/retro-office/core/geometry";
import type {
  JanitorActor,
  RenderAgent,
} from "@/features/retro-office/core/types";
import { AgentModelProps } from "@/features/retro-office/objects/types";

const MAX_NAMEPLATE_TEXT_LENGTH = 10;
const MAX_SUBTITLE_TEXT_LENGTH = 20;
const MAX_SPEECH_BUBBLE_TEXT_LENGTH = 180;
const MAX_SPEECH_BUBBLE_LINES = 4;

const formatAgentNameplateText = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= MAX_NAMEPLATE_TEXT_LENGTH) return normalized;
  const [firstName] = normalized.split(" ");
  return firstName || normalized;
};

/**
 * Compress a role description to one short nameplate line.
 *
 * Agent roles arrive as full sentences ("technical planner and business
 * systems analyst for Smartways. Converts Jira tickets into…"); rendered raw
 * they wrap into a wall of text above every agent. Keep the first clause,
 * clamped at a word boundary, so the plate stays a single line.
 */
export const formatAgentSubtitleText = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const clause =
    normalized.split(/(?:\.\s+|\s+[—–]\s+)/)[0]?.replace(/[.;\s]+$/, "") ||
    normalized;
  if (clause.length <= MAX_SUBTITLE_TEXT_LENGTH) return clause;
  const cut = clause.slice(0, MAX_SUBTITLE_TEXT_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 8 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:]+$/,
    "",
  );
  return `${head}…`;
};

const flattenSpeechBubbleMarkdown = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const clampSpeechBubbleText = (value: string) => {
  if (value.length <= MAX_SPEECH_BUBBLE_TEXT_LENGTH) {
    return { text: value, truncated: false };
  }
  const slice = value.slice(0, MAX_SPEECH_BUBBLE_TEXT_LENGTH - 1).trimEnd();
  return { text: `${slice}…`, truncated: true };
};

export const AgentModel = memo(function AgentModel({
  agentId,
  name,
  subtitle,
  status,
  color,
  appearance,
  agentsRef,
  agentLookupRef,
  onHover,
  onUnhover,
  onClick,
  onContextMenu,
  showSpeech = false,
  speechText = null,
  suppressSpeechBubble = false,
  huddleSeatIndex = null,
}: AgentModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const statusDotMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulseRingRef = useRef<THREE.Mesh>(null);
  const pulseRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const leftEyeHighlightRef = useRef<THREE.Mesh>(null);
  const rightEyeHighlightRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const leftMouthCornerRef = useRef<THREE.Mesh>(null);
  const rightMouthCornerRef = useRef<THREE.Mesh>(null);
  const leftBrowRef = useRef<THREE.Mesh>(null);
  const rightBrowRef = useRef<THREE.Mesh>(null);
  const heldPaddleRef = useRef<THREE.Group>(null);
  const heldPaddleFaceRef = useRef<THREE.MeshStandardMaterial>(null);
  const heldCleaningToolRef = useRef<THREE.Group>(null);
  const heldCleaningHeadRef = useRef<THREE.MeshStandardMaterial>(null);
  const heldBucketRef = useRef<THREE.Group>(null);
  const heldScrubberRef = useRef<THREE.Group>(null);
  const speechBubbleRef = useRef<THREE.Group>(null);
  const speechBubbleMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const awayBubbleRef = useRef<THREE.Group>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const pos = useRef(new THREE.Vector3(0, 0, 0));
  const resolvedAppearance = useMemo(
    () => appearance ?? createDefaultAgentAvatarProfile(agentId),
    [agentId, appearance],
  );

  useFrame(() => {
    const agent =
      agentLookupRef?.current?.get(agentId) ??
      agentsRef.current?.find((candidate) => candidate.id === agentId);
    if (!agent || !groupRef.current) return;

    const [wx, , wz] = toWorld(agent.x, agent.y);
    pos.current.set(wx, 0, wz);
    groupRef.current.position.lerp(pos.current, 0.15);

    const targetY = agent.facing;
    let rotDelta = targetY - groupRef.current.rotation.y;
    while (rotDelta > Math.PI) rotDelta -= Math.PI * 2;
    while (rotDelta < -Math.PI) rotDelta += Math.PI * 2;
    groupRef.current.rotation.y += rotDelta * 0.12;
    const isWorkout = agent.state === "working_out";
    const isDancing = agent.state === "dancing";
    const isJanitor = "role" in agent && agent.role === "janitor";
    const janitorTool = isJanitor
      ? (agent as RenderAgent & JanitorActor).janitorTool
      : undefined;
    const workoutStyle = agent.workoutStyle ?? "lift";
    const frameValue = agent.frame + (agent.phaseOffset ?? 0) / WALK_ANIM_SPEED;
    const walkPhase = Math.sin(frameValue * WALK_ANIM_SPEED);
    const workoutPhase = Math.sin(
      agent.frame * 0.18 + (agent.phaseOffset ?? 0),
    );
    const workoutPushPhase = Math.sin(
      agent.frame * 0.18 + (agent.phaseOffset ?? 0) + Math.PI / 2,
    );
    groupRef.current.rotation.z = 0;
    groupRef.current.rotation.x =
      agent.state === "sitting"
        ? -0.15
        : isDancing
          ? Math.sin(agent.frame * 0.18 + (agent.phaseOffset ?? 0)) * 0.06
          : isWorkout
            ? workoutStyle === "bike"
              ? 0.18
              : workoutStyle === "row"
                ? -0.12 + Math.max(0, workoutPhase) * 0.08
                : workoutStyle === "stretch"
                  ? -0.08
                  : workoutStyle === "run"
                    ? 0.08
                    : workoutStyle === "box"
                      ? 0.04
                      : 0.02
            : agent.pingPongUntil
              ? 0.08
              : 0;
    const bounce =
      agent.state === "walking"
        ? Math.sin(frameValue * WALK_ANIM_SPEED) * 0.04
        : isDancing
          ? 0.03 +
            Math.abs(Math.sin(agent.frame * 0.22 + (agent.phaseOffset ?? 0))) *
              0.05
          : isWorkout
            ? workoutStyle === "stretch"
              ? 0.012 + Math.abs(workoutPhase) * 0.018
              : workoutStyle === "row"
                ? 0.015 + Math.abs(workoutPhase) * 0.028
                : 0.02 + Math.abs(workoutPhase) * 0.04
            : 0;
    const breathe =
      agent.state === "standing" || isWorkout || agent.pingPongUntil
        ? Math.sin(frameValue * 0.03) * 0.01
        : 0;
    groupRef.current.position.y = bounce + breathe;

    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = 0;
      leftArmRef.current.rotation.y = 0;
      leftArmRef.current.rotation.z = 0;
      if (isJanitor && janitorTool !== "broom") {
        leftArmRef.current.rotation.x = -0.22;
        leftArmRef.current.rotation.z = -0.08;
      } else if (agent.state === "walking") {
        leftArmRef.current.rotation.x = walkPhase * 0.4;
      } else if (isDancing) {
        leftArmRef.current.rotation.x =
          -0.8 + Math.sin(agent.frame * 0.22) * 0.9;
        leftArmRef.current.rotation.z =
          -0.45 + Math.cos(agent.frame * 0.16) * 0.18;
        leftArmRef.current.rotation.y = -0.08;
        groupRef.current.rotation.z = Math.sin(agent.frame * 0.12) * 0.08;
      } else if (isWorkout) {
        if (workoutStyle === "run") {
          leftArmRef.current.rotation.x = -(0.28 + workoutPhase * 1.05);
          leftArmRef.current.rotation.z = -0.08;
        } else if (workoutStyle === "bike") {
          leftArmRef.current.rotation.x = -(1.05 + workoutPushPhase * 0.16);
          leftArmRef.current.rotation.z = -0.18;
          leftArmRef.current.rotation.y = -0.12;
        } else if (workoutStyle === "row") {
          leftArmRef.current.rotation.x = -(
            0.95 -
            Math.max(0, workoutPhase) * 0.7
          );
          leftArmRef.current.rotation.z = -0.16;
          leftArmRef.current.rotation.y = -0.1;
        } else if (workoutStyle === "box") {
          leftArmRef.current.rotation.x = -(
            0.92 +
            Math.max(0, workoutPushPhase) * 0.45
          );
          leftArmRef.current.rotation.z = -0.52;
          leftArmRef.current.rotation.y = -0.06;
          groupRef.current.rotation.z = 0.05;
        } else if (workoutStyle === "stretch") {
          leftArmRef.current.rotation.x = -1.58;
          leftArmRef.current.rotation.z = -0.42;
          leftArmRef.current.rotation.y = -0.08;
        } else {
          leftArmRef.current.rotation.x = -(
            0.28 +
            Math.abs(workoutPhase) * 0.28
          );
          leftArmRef.current.rotation.z = -0.58;
          leftArmRef.current.rotation.y = -0.12;
        }
      } else if (agent.pingPongUntil) {
        leftArmRef.current.rotation.x =
          0.2 + Math.sin(agent.frame * 0.08) * 0.28;
      } else if (agent.state === "sitting") {
        leftArmRef.current.rotation.x = 0.3;
      }
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = 0;
      rightArmRef.current.rotation.y = 0;
      rightArmRef.current.rotation.z = 0;
      if (isJanitor && janitorTool !== "broom") {
        rightArmRef.current.rotation.x = -0.95;
        rightArmRef.current.rotation.y = 0.18;
        rightArmRef.current.rotation.z = 0.08;
      } else if (agent.state === "walking") {
        rightArmRef.current.rotation.x = -walkPhase * 0.4;
      } else if (isDancing) {
        rightArmRef.current.rotation.x =
          -0.8 - Math.sin(agent.frame * 0.22) * 0.9;
        rightArmRef.current.rotation.z =
          0.45 - Math.cos(agent.frame * 0.16) * 0.18;
        rightArmRef.current.rotation.y = 0.08;
        groupRef.current.rotation.z = Math.sin(agent.frame * 0.12) * 0.08;
      } else if (isWorkout) {
        if (workoutStyle === "run") {
          rightArmRef.current.rotation.x = -(0.28 - workoutPhase * 1.05);
          rightArmRef.current.rotation.z = 0.08;
        } else if (workoutStyle === "bike") {
          rightArmRef.current.rotation.x = -(1.05 - workoutPushPhase * 0.16);
          rightArmRef.current.rotation.z = 0.18;
          rightArmRef.current.rotation.y = 0.12;
        } else if (workoutStyle === "row") {
          rightArmRef.current.rotation.x = -(
            0.95 -
            Math.max(0, -workoutPhase) * 0.7
          );
          rightArmRef.current.rotation.z = 0.16;
          rightArmRef.current.rotation.y = 0.1;
        } else if (workoutStyle === "box") {
          rightArmRef.current.rotation.x = -(
            0.92 +
            Math.max(0, -workoutPushPhase) * 0.45
          );
          rightArmRef.current.rotation.z = 0.52;
          rightArmRef.current.rotation.y = 0.06;
          groupRef.current.rotation.z = -0.05;
        } else if (workoutStyle === "stretch") {
          rightArmRef.current.rotation.x = -1.58;
          rightArmRef.current.rotation.z = 0.42;
          rightArmRef.current.rotation.y = 0.08;
        } else {
          rightArmRef.current.rotation.x = -(
            0.28 +
            Math.abs(workoutPhase) * 0.28
          );
          rightArmRef.current.rotation.z = 0.58;
          rightArmRef.current.rotation.y = 0.12;
        }
      } else if (agent.pingPongUntil) {
        rightArmRef.current.rotation.x =
          0.08 - Math.sin(agent.frame * 0.08) * 0.16;
      } else if (agent.state === "sitting") {
        rightArmRef.current.rotation.x = 0.3;
      }
    }
    if (leftLegRef.current) {
      leftLegRef.current.rotation.x =
        agent.state === "walking"
          ? walkPhase * 0.35
          : isDancing
            ? Math.sin(agent.frame * 0.22 + (agent.phaseOffset ?? 0)) * 0.35
            : isWorkout
              ? workoutStyle === "run"
                ? workoutPhase * 0.7
                : workoutStyle === "bike"
                  ? workoutPhase * 0.82
                  : workoutStyle === "row"
                    ? 0.14 + Math.max(0, workoutPhase) * 0.42
                    : workoutStyle === "stretch"
                      ? -0.2 + Math.abs(workoutPhase) * 0.08
                      : workoutStyle === "box"
                        ? 0.06 + workoutPhase * 0.14
                        : workoutPhase * 0.18
              : 0;
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x =
        agent.state === "walking"
          ? -walkPhase * 0.35
          : isDancing
            ? -Math.sin(agent.frame * 0.22 + (agent.phaseOffset ?? 0)) * 0.35
            : isWorkout
              ? workoutStyle === "run"
                ? -workoutPhase * 0.7
                : workoutStyle === "bike"
                  ? -workoutPhase * 0.82
                  : workoutStyle === "row"
                    ? 0.14 + Math.max(0, -workoutPhase) * 0.42
                    : workoutStyle === "stretch"
                      ? -0.12 + Math.abs(workoutPhase) * 0.08
                      : workoutStyle === "box"
                        ? 0.06 - workoutPhase * 0.14
                        : -workoutPhase * 0.18
              : 0;
    }

    const working =
      agent.state === "sitting" ||
      isWorkout ||
      isDancing ||
      agent.status === "working";
    const isError = agent.status === "error";
    const isAway = agent.state === "away";

    if (statusDotMatRef.current) {
      statusDotMatRef.current.color.set(
        isError ? "#ef4444" : working ? "#22c55e" : "#f59e0b",
      );
    }

    if (pulseRingRef.current && pulseRingMatRef.current) {
      if (working || isError) {
        const pulse = (Math.sin(agent.frame * 0.05) + 1) / 2;
        const scale = isError ? 1.25 + pulse * 0.55 : 1.2 + pulse * 0.8;
        pulseRingRef.current.scale.setScalar(scale);
        pulseRingMatRef.current.color.set(isError ? "#ef4444" : "#22c55e");
        pulseRingMatRef.current.opacity = isError
          ? 0.7 - pulse * 0.3
          : 0.55 - pulse * 0.45;
        pulseRingRef.current.visible = true;
      } else {
        pulseRingRef.current.visible = false;
      }
    }

    if (awayBubbleRef.current) awayBubbleRef.current.visible = isAway;
    if (bodyMatRef.current) bodyMatRef.current.opacity = isAway ? 0.45 : 1;
    if (groupRef.current) {
      groupRef.current.traverse((child) => {
        // Physical materials (glasses lenses) keep their fixed transparency.
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial &&
          !(child.material instanceof THREE.MeshPhysicalMaterial)
        ) {
          child.material.transparent = isAway;
          child.material.opacity = isAway ? 0.45 : 1;
        }
      });
    }

    const blinkSeed = agentId
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const blinkCycle = isAway ? 180 : isError ? 120 : working ? 170 : 240;
    const blinkWindow = isAway ? 26 : isError ? 18 : 12;
    const blinkPhase = (agent.frame + blinkSeed * 17) % blinkCycle;
    let eyeOpen = isError ? 0.92 : working ? 0.84 : 1.12;

    if (blinkPhase < blinkWindow) {
      const midpoint = blinkWindow / 2;
      eyeOpen *= Math.min(1, Math.abs(blinkPhase - midpoint) / midpoint);
    }
    if (working) eyeOpen = Math.max(0.48, eyeOpen);
    if (isError) eyeOpen = Math.max(0.28, eyeOpen);
    if (isAway) eyeOpen = Math.min(eyeOpen, 0.2);

    const eyeScaleX = isError ? 1.2 : working ? 1.06 : 1.12;
    const eyeScaleY = Math.max(0.05, eyeOpen);
    const eyeOffsetY =
      (working ? -0.006 : 0) +
      (isError ? -0.004 : 0) +
      (agent.state === "walking" ? 0.004 : 0) +
      (isAway ? -0.008 : 0);

    for (const eyeRef of [leftEyeRef, rightEyeRef]) {
      if (!eyeRef.current) continue;
      eyeRef.current.scale.x = eyeScaleX;
      eyeRef.current.scale.y = eyeScaleY;
      eyeRef.current.position.y = 0.475 + eyeOffsetY;
    }
    for (const highlightRef of [leftEyeHighlightRef, rightEyeHighlightRef]) {
      if (!highlightRef.current) continue;
      highlightRef.current.visible = eyeOpen > 0.45 && !isAway;
      highlightRef.current.position.y = 0.482 + eyeOffsetY;
    }

    if (mouthRef.current) {
      mouthRef.current.rotation.z = 0;
      mouthRef.current.position.set(0, 0.436, 0.074);
      if (isAway) {
        mouthRef.current.scale.set(0.5, 0.12, 1);
        mouthRef.current.position.y = 0.434;
      } else if (isError) {
        mouthRef.current.scale.set(1.28, 0.16, 1);
        mouthRef.current.position.y = 0.43;
      } else if (working) {
        mouthRef.current.scale.set(0.92, 0.14, 1);
        mouthRef.current.position.y = 0.437;
      } else if (agent.state === "walking") {
        const talkPulse =
          0.38 + (Math.sin(agent.frame * 0.14 + blinkSeed) + 1) * 0.22;
        mouthRef.current.scale.set(0.95, talkPulse, 1);
      } else {
        mouthRef.current.scale.set(1.35, 0.34, 1);
        mouthRef.current.position.y = 0.428;
      }
    }

    const showSmileCorners =
      !isAway && !isError && !working && agent.state !== "walking";
    const showFrownCorners = isError;
    if (leftMouthCornerRef.current && rightMouthCornerRef.current) {
      leftMouthCornerRef.current.visible = showSmileCorners || showFrownCorners;
      rightMouthCornerRef.current.visible =
        showSmileCorners || showFrownCorners;
      leftMouthCornerRef.current.position.set(-0.031, 0.434, 0.074);
      rightMouthCornerRef.current.position.set(0.031, 0.434, 0.074);
      if (showFrownCorners) {
        leftMouthCornerRef.current.rotation.z = -0.6;
        rightMouthCornerRef.current.rotation.z = 0.6;
        leftMouthCornerRef.current.position.y = 0.425;
        rightMouthCornerRef.current.position.y = 0.425;
      } else if (showSmileCorners) {
        leftMouthCornerRef.current.rotation.z = 0.62;
        rightMouthCornerRef.current.rotation.z = -0.62;
        leftMouthCornerRef.current.position.y = 0.438;
        rightMouthCornerRef.current.position.y = 0.438;
      }
    }

    if (leftBrowRef.current && rightBrowRef.current) {
      leftBrowRef.current.position.y = 0.52;
      rightBrowRef.current.position.y = 0.52;
      if (isAway) {
        leftBrowRef.current.rotation.z = -0.24;
        rightBrowRef.current.rotation.z = 0.24;
        leftBrowRef.current.position.y = 0.512;
        rightBrowRef.current.position.y = 0.512;
      } else if (isError) {
        leftBrowRef.current.rotation.z = 0.42;
        rightBrowRef.current.rotation.z = -0.42;
        leftBrowRef.current.position.y = 0.516;
        rightBrowRef.current.position.y = 0.516;
      } else if (working) {
        leftBrowRef.current.rotation.z = 0.3;
        rightBrowRef.current.rotation.z = -0.3;
      } else {
        leftBrowRef.current.rotation.z = -0.18;
        rightBrowRef.current.rotation.z = 0.18;
        leftBrowRef.current.position.y = 0.526;
        rightBrowRef.current.position.y = 0.526;
      }
    }

    const ambientBubbleVisible =
      (!suppressSpeechBubble && isError) ||
      (!isAway &&
        !suppressSpeechBubble &&
        !working &&
        !isError &&
        agent.state === "standing" &&
        (agent.frame + blinkSeed * 11) % 320 < 42);
    const bumpTalking = (agent.bumpTalkUntil ?? 0) > Date.now();
    // In a huddle the bubbles are close enough to overlap into an unreadable
    // stack, so the rotating talk pulse owns the ambient "..." bubble. The
    // scene grants one real speaking turn at a time, and that speaker is never
    // competing with another bubble — it always shows.
    const waitingForTurnInHuddle =
      agent.conversationGroupId !== undefined &&
      agent.state === "standing" &&
      !bumpTalking &&
      !showSpeech;

    if (speechBubbleRef.current) {
      const bubbleVisible =
        !suppressSpeechBubble &&
        !waitingForTurnInHuddle &&
        (showSpeech || bumpTalking || ambientBubbleVisible);
      speechBubbleRef.current.visible = bubbleVisible;
      if (bubbleVisible) {
        if (showSpeech && speechText?.trim()) {
          speechBubbleRef.current.scale.setScalar(1);
        } else {
          const pulseBase = isError
            ? 1.06
            : showSpeech || bumpTalking
              ? 1.03
              : 0.98;
          const pulse =
            pulseBase + Math.sin(agent.frame * (isError ? 0.18 : 0.12)) * 0.06;
          speechBubbleRef.current.scale.setScalar(pulse);
        }
      }
    }

    if (speechBubbleMatRef.current) {
      speechBubbleMatRef.current.color.set(
        isError ? "#3a1016" : working ? "#1d2a17" : "#1a2030",
      );
      speechBubbleMatRef.current.opacity = isError ? 0.97 : 0.92;
    }

    if (heldPaddleRef.current) {
      const isPlaying = agent.pingPongUntil !== undefined;
      heldPaddleRef.current.visible = isPlaying;
      if (isPlaying) {
        const swing = Math.sin(agent.frame * 0.08);
        heldPaddleRef.current.position.set(-0.01, -0.21, 0.07 + swing * 0.015);
        heldPaddleRef.current.rotation.set(-0.55 + swing * 0.1, 0.25, -0.35);
      }
    }

    if (heldPaddleFaceRef.current) {
      heldPaddleFaceRef.current.color.set(
        agent.pingPongSide === 0 ? "#1f4fa8" : "#c53b30",
      );
    }

    if (heldCleaningToolRef.current) {
      const showBroom = isJanitor && janitorTool === "broom";
      heldCleaningToolRef.current.visible = showBroom;
      if (showBroom) {
        const sweep =
          agent.state === "walking" ? Math.sin(agent.frame * 0.08) * 0.08 : 0;
        heldCleaningToolRef.current.position.set(
          -0.02,
          -0.2,
          0.08 + sweep * 0.06,
        );
        heldCleaningToolRef.current.rotation.set(-0.8, 0.18, -0.18);
      }
    }

    if (heldCleaningHeadRef.current) {
      heldCleaningHeadRef.current.color.set("#facc15");
    }

    if (heldBucketRef.current) {
      const showVacuum = isJanitor && janitorTool === "vacuum";
      heldBucketRef.current.visible = showVacuum;
      if (showVacuum) {
        heldBucketRef.current.position.set(-0.08, -0.1, 0.18);
        heldBucketRef.current.rotation.set(-0.32, 0.22, -0.38);
      }
    }

    if (heldScrubberRef.current) {
      const showScrubber = isJanitor && janitorTool === "floor_scrubber";
      heldScrubberRef.current.visible = showScrubber;
      if (showScrubber) {
        heldScrubberRef.current.position.set(-0.1, -0.08, 0.2);
        heldScrubberRef.current.rotation.set(-0.28, 0.18, -0.42);
      }
    }
  });

  const skin = resolvedAppearance.body.skinTone;
  const topColor = resolvedAppearance.clothing.topColor;
  const trouserColor = resolvedAppearance.clothing.bottomColor;
  const shoeColor = resolvedAppearance.clothing.shoesColor;
  const hairColor = resolvedAppearance.hair.color;
  const hairStyle = resolvedAppearance.hair.style;
  const topStyle = resolvedAppearance.clothing.topStyle;
  const bottomStyle = resolvedAppearance.clothing.bottomStyle;
  const hatStyle = resolvedAppearance.accessories.hatStyle;
  const showGlasses = resolvedAppearance.accessories.glasses;
  const showHeadset = resolvedAppearance.accessories.headset;
  const showBackpack = resolvedAppearance.accessories.backpack;
  const accessoryColor = topColor;
  const isLongDress = topStyle === "long-dress";
  const isShortDress = topStyle === "short-dress";
  const isDress = isLongDress || isShortDress;
  const sleeveColor = topStyle === "jacket" ? "#dbe4ff" : topColor;
  const cuffColor = topStyle === "hoodie" ? "#d1d5db" : sleeveColor;
  // Jacket accent brightened ~10% so it doesn't turn muddy under ACES tone mapping.
  const topAccentColor = topStyle === "jacket" ? "#2a3648" : cuffColor;

  const faceTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = "rgba(196,122,84,0.18)";
    ctx.beginPath();
    ctx.arc(18, 38, 7, 0, Math.PI * 2);
    ctx.arc(46, 38, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8a06e";
    ctx.fillRect(30, 28, 4, 10);
    ctx.fillRect(29, 37, 6, 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [skin]);

  const resolvedSpeechText =
    showSpeech && speechText?.trim()
      ? speechText.trim()
      : status === "error"
        ? "error"
        : "...";
  const activeSpeechBubble = showSpeech && Boolean(speechText?.trim());
  const normalizedSpeechBubbleText = activeSpeechBubble
    ? flattenSpeechBubbleMarkdown(resolvedSpeechText)
    : resolvedSpeechText;
  const speechBubblePreview = activeSpeechBubble
    ? clampSpeechBubbleText(normalizedSpeechBubbleText)
    : { text: normalizedSpeechBubbleText, truncated: false };
  const speechBubbleDisplayText = speechBubblePreview.text;
  const speechBubbleWasTruncated = speechBubblePreview.truncated;
  const speechBubbleTextLength = speechBubbleDisplayText.length;
  const speechBubbleWidth = activeSpeechBubble
    ? Math.min(4.6, Math.max(1.8, 1.55 + speechBubbleTextLength * 0.018))
    : 0.36;
  const speechBubblePaddingX = activeSpeechBubble ? 0.34 : 0.06;
  const speechBubblePaddingY = activeSpeechBubble ? 0.3 : 0.06;
  const speechBubbleMaxWidth = Math.max(
    0.24,
    speechBubbleWidth - speechBubblePaddingX,
  );
  const estimatedSpeechCharsPerLine = activeSpeechBubble
    ? Math.max(10, Math.floor(speechBubbleMaxWidth * 7))
    : 8;
  const estimatedSpeechLines = activeSpeechBubble
    ? Math.max(
        1,
        Math.min(
          MAX_SPEECH_BUBBLE_LINES,
          Math.ceil(speechBubbleTextLength / estimatedSpeechCharsPerLine),
        ),
      )
    : 1;
  const speechBubbleHeight = activeSpeechBubble
    ? Math.max(0.72, estimatedSpeechLines * 0.26 + speechBubblePaddingY)
    : 0.2;
  const speechBubbleFontSize = activeSpeechBubble
    ? speechBubbleTextLength > 110
      ? 0.188
      : speechBubbleTextLength > 70
        ? 0.2
        : 0.216
    : 0.13;
  const speechBubbleTextColor = activeSpeechBubble
    ? "#f8fafc"
    : status === "error"
      ? "#ff9aa5"
      : status === "working"
        ? "#b9f99d"
        : "#a0c8ff";
  const speechBubbleBorderColor = activeSpeechBubble
    ? status === "error"
      ? "#ff7f93"
      : status === "working"
        ? "#93f57d"
        : "#8dc4ff"
    : "transparent";
  const speechBubbleBorderInset = activeSpeechBubble ? 0.03 : 0;
  const nameplateText = name ? formatAgentNameplateText(name) : "";
  // A huddle packs four plates into roughly one plate's worth of screen space.
  // Drop the role line there and step each seat's plate to its own height so
  // the names read as a list instead of a pile.
  const inHuddle = huddleSeatIndex !== null;
  const subtitleText =
    !inHuddle && typeof subtitle === "string"
      ? formatAgentSubtitleText(subtitle)
      : "";
  const nameplateHeight =
    1.05 + (inHuddle ? ((huddleSeatIndex ?? 0) % 4) * 0.17 : 0);
  const nameplateFontSize =
    nameplateText.length > 9 ? 0.118 : nameplateText.length > 7 ? 0.13 : 0.144;

  return (
    <group
      ref={groupRef}
      scale={[AGENT_SCALE, AGENT_SCALE, AGENT_SCALE]}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover?.(agentId);
      }}
      onPointerOut={() => onUnhover?.()}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(agentId);
      }}
      onContextMenu={(event) => {
        event.stopPropagation();
        const nativeEvent = event.nativeEvent as MouseEvent;
        onContextMenu?.(agentId, nativeEvent.clientX, nativeEvent.clientY);
      }}
    >
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.2} />
      </mesh>
      <group ref={rightLegRef} position={[-0.045, 0.1, 0]}>
        {isDress || bottomStyle === "long-skirt" || bottomStyle === "mini-skirt" ? (
          <mesh castShadow>
            <boxGeometry args={[0.05, 0.14, 0.05]} />
            <meshStandardMaterial color={skin} roughness={0.55} />
          </mesh>
        ) : bottomStyle === "shorts" ? (
          <>
            <mesh position={[0, 0.03, 0]} castShadow>
              <boxGeometry args={[0.07, 0.08, 0.08]} />
              <meshStandardMaterial color={trouserColor} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.045, 0]} castShadow>
              <boxGeometry args={[0.05, 0.06, 0.05]} />
              <meshStandardMaterial color={skin} roughness={0.55} />
            </mesh>
          </>
        ) : bottomStyle === "hot-pants" ? (
          <>
            <mesh position={[0, 0.052, 0]} castShadow>
              <boxGeometry args={[0.07, 0.04, 0.08]} />
              <meshStandardMaterial color={trouserColor} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.025, 0]} castShadow>
              <boxGeometry args={[0.05, 0.1, 0.05]} />
              <meshStandardMaterial color={skin} roughness={0.55} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow>
              <boxGeometry args={[0.07, 0.14, 0.08]} />
              <meshStandardMaterial color={trouserColor} roughness={0.75} />
            </mesh>
            {bottomStyle === "cuffed" ? (
              <mesh position={[0, -0.05, 0]}>
                <boxGeometry args={[0.074, 0.022, 0.084]} />
                <meshStandardMaterial color="#d1d5db" roughness={0.75} />
              </mesh>
            ) : null}
          </>
        )}
        <mesh position={[0, -0.09, 0]} castShadow>
          <boxGeometry args={[0.07, 0.05, 0.12]} />
          <meshStandardMaterial color={shoeColor} roughness={0.75} />
        </mesh>
      </group>
      <group ref={leftLegRef} position={[0.045, 0.1, 0]}>
        {isDress || bottomStyle === "long-skirt" || bottomStyle === "mini-skirt" ? (
          <mesh castShadow>
            <boxGeometry args={[0.05, 0.14, 0.05]} />
            <meshStandardMaterial color={skin} roughness={0.55} />
          </mesh>
        ) : bottomStyle === "shorts" ? (
          <>
            <mesh position={[0, 0.03, 0]} castShadow>
              <boxGeometry args={[0.07, 0.08, 0.08]} />
              <meshStandardMaterial color={trouserColor} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.045, 0]} castShadow>
              <boxGeometry args={[0.05, 0.06, 0.05]} />
              <meshStandardMaterial color={skin} roughness={0.55} />
            </mesh>
          </>
        ) : bottomStyle === "hot-pants" ? (
          <>
            <mesh position={[0, 0.052, 0]} castShadow>
              <boxGeometry args={[0.07, 0.04, 0.08]} />
              <meshStandardMaterial color={trouserColor} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.025, 0]} castShadow>
              <boxGeometry args={[0.05, 0.1, 0.05]} />
              <meshStandardMaterial color={skin} roughness={0.55} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow>
              <boxGeometry args={[0.07, 0.14, 0.08]} />
              <meshStandardMaterial color={trouserColor} roughness={0.75} />
            </mesh>
            {bottomStyle === "cuffed" ? (
              <mesh position={[0, -0.05, 0]}>
                <boxGeometry args={[0.074, 0.022, 0.084]} />
                <meshStandardMaterial color="#d1d5db" roughness={0.75} />
              </mesh>
            ) : null}
          </>
        )}
        <mesh position={[0, -0.09, 0]} castShadow>
          <boxGeometry args={[0.07, 0.05, 0.12]} />
          <meshStandardMaterial color={shoeColor} roughness={0.75} />
        </mesh>
      </group>
      {!isDress && bottomStyle === "long-skirt" ? (
        <mesh position={[0, 0.13, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.135, 0.24, 4]} />
          <meshStandardMaterial color={trouserColor} roughness={0.72} />
        </mesh>
      ) : null}
      {!isDress && bottomStyle === "mini-skirt" ? (
        <mesh position={[0, 0.205, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.085, 0.12, 0.085, 4]} />
          <meshStandardMaterial color={trouserColor} roughness={0.72} />
        </mesh>
      ) : null}
      {showBackpack ? (
        <group position={[0, 0.28, -0.08]}>
          <mesh castShadow>
            <boxGeometry args={[0.15, 0.18, 0.06]} />
            <meshStandardMaterial color={accessoryColor} roughness={0.75} />
          </mesh>
          <mesh position={[-0.06, 0.02, 0.02]}>
            <boxGeometry args={[0.018, 0.16, 0.018]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.75} />
          </mesh>
          <mesh position={[0.06, 0.02, 0.02]}>
            <boxGeometry args={[0.018, 0.16, 0.018]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.75} />
          </mesh>
        </group>
      ) : null}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.2, 0.1]} />
        <meshStandardMaterial ref={bodyMatRef} color={topColor} roughness={0.75} />
      </mesh>
      {isLongDress ? (
        <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.14, 0.27, 4]} />
          <meshStandardMaterial color={topColor} roughness={0.7} />
        </mesh>
      ) : null}
      {isShortDress ? (
        <mesh position={[0, 0.195, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.13, 0.135, 4]} />
          <meshStandardMaterial color={topColor} roughness={0.7} />
        </mesh>
      ) : null}
      {topStyle === "hoodie" ? (
        <>
          <mesh position={[0, 0.35, -0.045]} castShadow>
            <boxGeometry args={[0.17, 0.1, 0.03]} />
            <meshStandardMaterial color={topColor} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.22, 0.056]}>
            <boxGeometry args={[0.11, 0.03, 0.012]} />
            <meshStandardMaterial color={cuffColor} roughness={0.75} />
          </mesh>
        </>
      ) : null}
      {topStyle === "jacket" ? (
        <>
          <mesh position={[0, 0.28, 0.056]}>
            <boxGeometry args={[0.182, 0.21, 0.012]} />
            <meshStandardMaterial color={topAccentColor} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.28, 0.063]}>
            <boxGeometry args={[0.034, 0.2, 0.01]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.75} />
          </mesh>
        </>
      ) : null}
      {topStyle === "sweater" ? (
        <>
          <mesh position={[0, 0.37, 0.056]}>
            <boxGeometry args={[0.09, 0.024, 0.012]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.195, 0.056]}>
            <boxGeometry args={[0.175, 0.024, 0.012]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.78} />
          </mesh>
        </>
      ) : null}
      {topStyle === "shirt" ? (
        <>
          <mesh position={[0, 0.28, 0.057]}>
            <boxGeometry args={[0.016, 0.19, 0.012]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
          <mesh position={[-0.032, 0.365, 0.058]} rotation={[0, 0, -0.4]}>
            <boxGeometry args={[0.07, 0.024, 0.012]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.7} />
          </mesh>
          <mesh position={[0.032, 0.365, 0.058]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.07, 0.024, 0.012]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.7} />
          </mesh>
        </>
      ) : null}
      <group ref={rightArmRef} position={[-0.12, 0.28, 0]}>
        <mesh position={[0, -0.08, 0]} castShadow>
          <boxGeometry args={[0.06, 0.16, 0.06]} />
          <meshStandardMaterial color={sleeveColor} roughness={0.75} />
        </mesh>
        {topStyle === "hoodie" || topStyle === "sweater" ? (
          <mesh position={[0, -0.145, 0]}>
            <boxGeometry args={[0.064, 0.03, 0.064]} />
            <meshStandardMaterial color={cuffColor} roughness={0.75} />
          </mesh>
        ) : null}
        <mesh position={[0, -0.17, 0]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshStandardMaterial color={skin} roughness={0.55} />
        </mesh>
        <group
          ref={heldPaddleRef}
          position={[-0.01, -0.21, 0.07]}
          visible={false}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.012, 18]} />
            <meshStandardMaterial
              ref={heldPaddleFaceRef}
              color="#c53b30"
              roughness={0.72}
            />
          </mesh>
          <mesh position={[0, -0.045, -0.015]} rotation={[0.12, 0, 0]}>
            <boxGeometry args={[0.014, 0.07, 0.014]} />
            <meshStandardMaterial color="#c59a68" roughness={0.74} />
          </mesh>
        </group>
        <group
          ref={heldCleaningToolRef}
          position={[-0.02, -0.2, 0.08]}
          rotation={[-0.8, 0.18, -0.18]}
          visible={false}
        >
          <mesh position={[0, -0.13, 0]}>
            <boxGeometry args={[0.012, 0.28, 0.012]} />
            <meshStandardMaterial color="#9a6b3c" roughness={0.76} />
          </mesh>
          <mesh position={[0, -0.28, 0.012]}>
            <boxGeometry args={[0.09, 0.028, 0.03]} />
            <meshStandardMaterial
              ref={heldCleaningHeadRef}
              color="#facc15"
              roughness={0.68}
            />
          </mesh>
        </group>
        {/* Vacuum cleaner: larger upright silhouette so it reads clearly in-scene. */}
        <group
          ref={heldBucketRef}
          position={[-0.08, -0.1, 0.18]}
          visible={false}
        >
          <mesh position={[0, -0.02, 0]}>
            <boxGeometry args={[0.015, 0.3, 0.015]} />
            <meshStandardMaterial color="#555" roughness={0.72} />
          </mesh>
          <mesh position={[0.025, -0.16, 0]}>
            <boxGeometry args={[0.08, 0.12, 0.07]} />
            <meshStandardMaterial color="#dc2626" roughness={0.48} />
          </mesh>
          <mesh position={[0.05, -0.24, 0.02]}>
            <boxGeometry args={[0.11, 0.024, 0.06]} />
            <meshStandardMaterial color="#1f2937" roughness={0.65} />
          </mesh>
          <mesh position={[0.02, -0.11, 0.035]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.03, 0.005, 10, 18, Math.PI]} />
            <meshStandardMaterial
              color="#94a3b8"
              roughness={0.36}
              metalness={0.18}
            />
          </mesh>
        </group>
        {/* Floor scrubber: prominent handle, body, and wide cleaning base. */}
        <group
          ref={heldScrubberRef}
          position={[-0.1, -0.08, 0.2]}
          visible={false}
        >
          <mesh position={[0, -0.02, 0]}>
            <boxGeometry args={[0.015, 0.32, 0.015]} />
            <meshStandardMaterial color="#777" roughness={0.7} />
          </mesh>
          <mesh position={[0.035, -0.17, 0]}>
            <boxGeometry args={[0.085, 0.08, 0.065]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.46} />
          </mesh>
          <mesh position={[0.06, -0.27, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.018, 24]} />
            <meshStandardMaterial color="#0ea5e9" roughness={0.52} />
          </mesh>
          <mesh position={[0.06, -0.23, 0.02]}>
            <boxGeometry args={[0.12, 0.018, 0.07]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
        </group>
      </group>
      <group ref={leftArmRef} position={[0.12, 0.28, 0]}>
        <mesh position={[0, -0.08, 0]} castShadow>
          <boxGeometry args={[0.06, 0.16, 0.06]} />
          <meshStandardMaterial color={sleeveColor} roughness={0.75} />
        </mesh>
        {topStyle === "hoodie" || topStyle === "sweater" ? (
          <mesh position={[0, -0.145, 0]}>
            <boxGeometry args={[0.064, 0.03, 0.064]} />
            <meshStandardMaterial color={cuffColor} roughness={0.75} />
          </mesh>
        ) : null}
        <mesh position={[0, -0.17, 0]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshStandardMaterial color={skin} roughness={0.55} />
        </mesh>
      </group>
      <mesh position={[0, 0.39, 0]}>
        <boxGeometry args={[0.07, 0.05, 0.07]} />
        <meshStandardMaterial color={skin} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.47, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.16, 0.14]} />
        <meshStandardMaterial attach="material-0" color={skin} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={skin} roughness={0.55} />
        <meshStandardMaterial attach="material-2" color={skin} roughness={0.55} />
        <meshStandardMaterial attach="material-3" color={skin} roughness={0.55} />
        <meshStandardMaterial attach="material-4" map={faceTexture} roughness={0.55} />
        <meshStandardMaterial attach="material-5" color={skin} roughness={0.55} />
      </mesh>
      {hairStyle === "short" ? (
        <mesh position={[0, 0.555, 0]} castShadow>
          <boxGeometry args={[0.17, 0.05, 0.15]} />
          <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
        </mesh>
      ) : null}
      {hairStyle === "parted" ? (
        <>
          <mesh position={[0, 0.555, 0]} castShadow>
            <boxGeometry args={[0.17, 0.045, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[-0.035, 0.59, 0.01]} rotation={[0.1, 0, -0.2]} castShadow>
            <boxGeometry args={[0.12, 0.03, 0.08]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
        </>
      ) : null}
      {hairStyle === "spiky" ? (
        <>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.16, 0.035, 0.14]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[-0.05, 0.59, 0]} rotation={[0, 0, -0.2]} castShadow>
            <boxGeometry args={[0.04, 0.06, 0.04]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.605, 0]} rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.04, 0.08, 0.04]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[0.05, 0.59, 0]} rotation={[0, 0, 0.2]} castShadow>
            <boxGeometry args={[0.04, 0.06, 0.04]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
        </>
      ) : null}
      {hairStyle === "bun" ? (
        <>
          <mesh position={[0, 0.548, 0]} castShadow>
            <boxGeometry args={[0.17, 0.04, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.6, -0.035]} castShadow>
            <sphereGeometry args={[0.042, 14, 14]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
        </>
      ) : null}
      {hairStyle === "long" ? (
        <>
          <mesh position={[0, 0.55, -0.02]} castShadow>
            <boxGeometry args={[0.17, 0.05, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.44, -0.07]} castShadow>
            <boxGeometry args={[0.16, 0.23, 0.04]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          {[-0.085, 0.085].map((x) => (
            <mesh key={x} position={[x, 0.45, 0.005]} castShadow>
              <boxGeometry args={[0.032, 0.2, 0.065]} />
              <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
            </mesh>
          ))}
        </>
      ) : null}
      {hairStyle === "bob" ? (
        <>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.17, 0.05, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0.49, 0]} castShadow>
              <boxGeometry args={[0.032, 0.12, 0.14]} />
              <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
            </mesh>
          ))}
        </>
      ) : null}
      {hairStyle === "twin-tails" ? (
        <>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.17, 0.05, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          {[-0.115, 0.115].map((x) => (
            <group key={x} position={[x, 0.485, -0.01]}>
              <mesh position={[0, 0.055, 0]} castShadow>
                <sphereGeometry args={[0.038, 12, 12]} />
                <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
              </mesh>
              <mesh position={[0, -0.04, 0]} castShadow>
                <boxGeometry args={[0.05, 0.17, 0.055]} />
                <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
              </mesh>
            </group>
          ))}
        </>
      ) : null}
      {hairStyle === "ponytail" ? (
        <>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.17, 0.05, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.535, -0.1]} castShadow>
            <sphereGeometry args={[0.042, 12, 12]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.44, -0.115]} rotation={[0.15, 0, 0]} castShadow>
            <boxGeometry args={[0.055, 0.19, 0.055]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
        </>
      ) : null}
      {hairStyle === "long-wave" ? (
        <>
          <mesh position={[0, 0.55, -0.02]} castShadow>
            <boxGeometry args={[0.17, 0.05, 0.15]} />
            <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
          </mesh>
          {[-0.09, 0.09].flatMap((x) =>
            [0.49, 0.42, 0.35].map((y, index) => (
              <mesh
                key={`${x}-${y}`}
                position={[x + (index % 2 === 0 ? -0.007 : 0.007) * Math.sign(x), y, -0.015]}
                rotation={[0, 0, (index % 2 === 0 ? 0.12 : -0.12) * Math.sign(x)]}
                castShadow
              >
                <boxGeometry args={[0.04, 0.09, 0.065]} />
                <meshStandardMaterial color={hairColor} roughness={0.35} metalness={0.05} />
              </mesh>
            )),
          )}
        </>
      ) : null}
      {hatStyle === "cap" ? (
        <>
          <mesh position={[0, 0.59, 0]} castShadow>
            <boxGeometry args={[0.172, 0.03, 0.152]} />
            <meshStandardMaterial color={accessoryColor} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.575, 0.07]}>
            <boxGeometry args={[0.09, 0.012, 0.05]} />
            <meshStandardMaterial color={accessoryColor} roughness={0.75} />
          </mesh>
        </>
      ) : null}
      {hatStyle === "beanie" ? (
        <mesh position={[0, 0.59, 0]} castShadow>
          <boxGeometry args={[0.18, 0.06, 0.16]} />
          <meshStandardMaterial color={accessoryColor} roughness={0.75} />
        </mesh>
      ) : null}
      {showHeadset ? (
        <>
          <mesh position={[0, 0.57, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <torusGeometry args={[0.09, 0.008, 8, 24, Math.PI]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.25} />
          </mesh>
          <mesh position={[-0.1, 0.48, 0]}>
            <boxGeometry args={[0.018, 0.05, 0.028]} />
            <meshStandardMaterial color="#475569" roughness={0.6} />
          </mesh>
          <mesh position={[0.1, 0.48, 0]}>
            <boxGeometry args={[0.018, 0.05, 0.028]} />
            <meshStandardMaterial color="#475569" roughness={0.6} />
          </mesh>
          <mesh position={[0.085, 0.43, 0.06]} rotation={[0.25, 0.25, -0.4]}>
            <boxGeometry args={[0.012, 0.06, 0.012]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.25} />
          </mesh>
        </>
      ) : null}
      <mesh ref={leftBrowRef} position={[-0.04, 0.52, 0.074]}>
        <boxGeometry args={[0.04, 0.01, 0.01]} />
        <meshBasicMaterial color="#342016" />
      </mesh>
      <mesh ref={rightBrowRef} position={[0.04, 0.52, 0.074]}>
        <boxGeometry args={[0.04, 0.01, 0.01]} />
        <meshBasicMaterial color="#342016" />
      </mesh>
      <mesh ref={leftEyeRef} position={[-0.04, 0.475, 0.072]}>
        <boxGeometry args={[0.03, 0.03, 0.01]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.04, 0.475, 0.072]}>
        <boxGeometry args={[0.03, 0.03, 0.01]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      <mesh ref={leftEyeHighlightRef} position={[-0.03, 0.482, 0.074]}>
        <boxGeometry args={[0.008, 0.008, 0.01]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      <mesh ref={rightEyeHighlightRef} position={[0.05, 0.482, 0.074]}>
        <boxGeometry args={[0.008, 0.008, 0.01]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      {showGlasses ? (
        <>
          <mesh position={[-0.04, 0.475, 0.078]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshBasicMaterial color="#111827" wireframe />
          </mesh>
          <mesh position={[0.04, 0.475, 0.078]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshBasicMaterial color="#111827" wireframe />
          </mesh>
          {/* Glassy lens panes inside the wireframe frames. */}
          <mesh position={[-0.04, 0.475, 0.078]}>
            <boxGeometry args={[0.044, 0.044, 0.006]} />
            <meshPhysicalMaterial
              color="#cfe2ff"
              transparent
              opacity={0.3}
              roughness={0.05}
            />
          </mesh>
          <mesh position={[0.04, 0.475, 0.078]}>
            <boxGeometry args={[0.044, 0.044, 0.006]} />
            <meshPhysicalMaterial
              color="#cfe2ff"
              transparent
              opacity={0.3}
              roughness={0.05}
            />
          </mesh>
          <mesh position={[0, 0.475, 0.078]}>
            <boxGeometry args={[0.02, 0.008, 0.01]} />
            <meshBasicMaterial color="#111827" />
          </mesh>
        </>
      ) : null}
      <mesh ref={mouthRef} position={[0, 0.436, 0.074]}>
        <boxGeometry args={[0.05, 0.014, 0.01]} />
        <meshBasicMaterial color="#9c4a4a" />
      </mesh>
      <mesh
        ref={leftMouthCornerRef}
        position={[-0.031, 0.438, 0.074]}
        visible={false}
      >
        <boxGeometry args={[0.014, 0.014, 0.01]} />
        <meshBasicMaterial color="#9c4a4a" />
      </mesh>
      <mesh
        ref={rightMouthCornerRef}
        position={[0.031, 0.438, 0.074]}
        visible={false}
      >
        <boxGeometry args={[0.014, 0.014, 0.01]} />
        <meshBasicMaterial color="#9c4a4a" />
      </mesh>
      <mesh
        ref={pulseRingRef}
        position={[0, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.13, 0.19, 24]} />
        <meshBasicMaterial
          ref={pulseRingMatRef}
          color="#22c55e"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      {!activeSpeechBubble && nameplateText ? (
        <Billboard position={[0, nameplateHeight, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[0.82, subtitleText ? 0.34 : 0.24]} />
            <meshBasicMaterial color="#080c14" transparent opacity={0.9} />
          </mesh>
          <mesh position={[-0.392, 0, 0]}>
            <planeGeometry args={[0.028, subtitleText ? 0.34 : 0.24]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0.355, subtitleText ? 0.05 : 0, 0]}>
            <circleGeometry args={[0.052, 14]} />
            <meshBasicMaterial ref={statusDotMatRef} color="#ef4444" />
          </mesh>
          <Text
            position={[-0.02, subtitleText ? 0.05 : 0, 0.001]}
            fontSize={nameplateFontSize}
            color="#e8dfc0"
            anchorX="center"
            anchorY="middle"
            maxWidth={0.68}
            font={undefined}
          >
            {nameplateText}
          </Text>
          {subtitleText ? (
            <Text
              position={[-0.02, -0.085, 0.001]}
              fontSize={0.062}
              color="#8ab4ff"
              anchorX="center"
              anchorY="middle"
              maxWidth={0.68}
              font={undefined}
            >
              {subtitleText}
            </Text>
          ) : null}
        </Billboard>
      ) : null}
      <group ref={awayBubbleRef} visible={false}>
        <Billboard position={[0, 1.3, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[0.32, 0.18]} />
            <meshBasicMaterial color="#0d1015" transparent opacity={0.85} />
          </mesh>
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.11}
            color="#6080b0"
            anchorX="center"
            anchorY="middle"
          >
            z z z
          </Text>
        </Billboard>
      </group>
      <group ref={speechBubbleRef} visible={false}>
        <Billboard position={[0, 1.45, 0]}>
          {activeSpeechBubble ? (
            <mesh
              position={[-speechBubbleWidth * 0.18, -speechBubbleHeight * 0.53, -0.0005]}
              rotation={[0, 0, Math.PI / 4]}
              renderOrder={99997}
            >
              <planeGeometry args={[0.22, 0.22]} />
              <meshBasicMaterial
                color="#1a2030"
                transparent
                opacity={0.82}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          ) : null}
          {activeSpeechBubble ? (
            <mesh position={[0, 0, -0.0015]} renderOrder={99998}>
              <planeGeometry
                args={[
                  speechBubbleWidth + speechBubbleBorderInset,
                  speechBubbleHeight + speechBubbleBorderInset,
                ]}
              />
              <meshBasicMaterial
                color={speechBubbleBorderColor}
                transparent
                opacity={0.88}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          ) : null}
          <mesh position={[0, 0, -0.001]} renderOrder={99999}>
            <planeGeometry args={[speechBubbleWidth, speechBubbleHeight]} />
            <meshBasicMaterial
              ref={speechBubbleMatRef}
              color="#1a2030"
              transparent
              opacity={activeSpeechBubble ? 0.76 : 0.92}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <Text
            position={
              activeSpeechBubble
                ? [-speechBubbleWidth / 2 + speechBubblePaddingX / 2, 0, 0.001]
                : [0, 0, 0.001]
            }
            fontSize={speechBubbleFontSize}
            color={speechBubbleTextColor}
            anchorX={activeSpeechBubble ? "left" : "center"}
            anchorY="middle"
            maxWidth={speechBubbleMaxWidth}
            textAlign={activeSpeechBubble ? "left" : "center"}
            lineHeight={1.1}
            renderOrder={100000}
            depthOffset={-10}
            material-depthTest={false}
            material-depthWrite={false}
          >
            {speechBubbleDisplayText}
          </Text>
          {activeSpeechBubble && speechBubbleWasTruncated ? (
            <Text
              position={[0, -speechBubbleHeight * 0.34, 0.001]}
              fontSize={0.09}
              color="#8ab4ff"
              anchorX="center"
              anchorY="middle"
              maxWidth={speechBubbleMaxWidth}
              textAlign="center"
              renderOrder={100001}
              depthOffset={-10}
              material-depthTest={false}
              material-depthWrite={false}
            >
              click for full chat
            </Text>
          ) : null}
        </Billboard>
      </group>
    </group>
  );
});

AgentModel.displayName = "AgentModel";
