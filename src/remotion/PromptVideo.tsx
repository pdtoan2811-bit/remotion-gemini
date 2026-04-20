/**
 * PromptVideo — Generic, data-driven Remotion composition
 *
 * Renders a multi-scene video from a Timeline object.
 * Reuses proven visual patterns from AInewsvideo:
 * - Word-by-word spring-animated captions
 * - Kinetic gradient overlays
 * - Floating particles + grain overlay
 * - Light leak flash on scene cuts
 * - Audio-reactive effects (when audio present)
 *
 * [MASTERMIND] Hostile spring stiffness=380, Easing.bezier(0.1,1,0,1)
 * [MASTERMIND] No shake jitter — micro-mutations via scale/gradient only
 * [MASTERMIND] Always-on grain + particles
 */

import {
  AbsoluteFill,
  Easing,
  Series,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Timeline, Scene } from "../lib/types";
import { PALETTES } from "../lib/constants";

// ── Types ────────────────────────────────────────────────────────────────────
export type PromptVideoProps = {
  timeline: Timeline;
};

// ── LAYER: Animated grain ────────────────────────────────────────────────────
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = (frame * 41) % 200;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='${seed} ${seed} 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
        pointerEvents: "none",
        zIndex: 100,
        mixBlendMode: "overlay",
      }}
    />
  );
};

// ── LAYER: Light leak on scene cut ───────────────────────────────────────────
const LightLeak: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 5, 12], [0.85, 0.4, 0], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.1, 1, 0, 1),
  });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 40% at 50% 10%, ${accent}cc 0%, transparent 70%)`,
        opacity,
        pointerEvents: "none",
        zIndex: 99,
        mixBlendMode: "screen",
      }}
    />
  );
};

// ── LAYER: Floating particles ────────────────────────────────────────────────
const Particles: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 2 }}>
      {Array.from({ length: 14 }).map((_, i) => {
        const seedX = (i * 173.3) % 100;
        const baseY = ((i * 61.7) % 130) - 15;
        const speed = 0.08 + (i % 6) * 0.05;
        const y = (((baseY - frame * speed) % 115) + 115) % 115;
        const size = 2 + (i % 4) * 1.5;
        const opacity =
          0.08 + (Math.sin(frame * 0.04 + i * 1.3) + 1) * 0.1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${seedX}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: accent,
              opacity,
              boxShadow: `0 0 ${size * 3}px ${accent}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ── LAYER: Kinetic gradient overlay ──────────────────────────────────────────
const KineticOverlay: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const gX = interpolate(Math.sin(frame * 0.025), [-1, 1], [30, 70]);
  const gY = interpolate(Math.cos(frame * 0.018), [-1, 1], [20, 60]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 28% 45% at ${gX}% ${gY}%, ${accent}14 0%, transparent 70%)`,
        pointerEvents: "none",
        zIndex: 4,
      }}
    />
  );
};

// ── TAG BADGE ────────────────────────────────────────────────────────────────
const TagBadge: React.FC<{
  tag: string;
  accent: string;
  sceneIndex: number;
  total: number;
}> = ({ tag, accent, sceneIndex, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    config: { stiffness: 440, damping: 16, mass: 0.6 },
  });
  const x = interpolate(progress, [0, 1], [-240, 0], {
    easing: Easing.bezier(0.1, 1, 0, 1),
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 100,
        left: 32,
        transform: `translateX(${x}px)`,
        display: "flex",
        gap: 12,
        alignItems: "center",
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: accent,
          color: "#000",
          fontWeight: 900,
          fontSize: 32,
          borderRadius: 999,
          padding: "10px 28px",
          boxShadow: `0 4px 30px ${accent}99`,
          fontFamily: "'Inter', system-ui, sans-serif",
          letterSpacing: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        {tag}
      </div>
      <div
        style={{
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(10px)",
          border: "1.5px solid rgba(255,255,255,0.15)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 28,
          borderRadius: 999,
          padding: "10px 22px",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {sceneIndex + 1} / {total}
      </div>
    </div>
  );
};

// ── CAPTION BLOCK — Word-by-word reveal ──────────────────────────────────────
const CaptionBlock: React.FC<{
  caption: string;
  accent: string;
}> = ({ caption, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whole block slides up from bottom on scene entry
  const blockEntry = spring({
    frame,
    fps,
    config: { stiffness: 300, damping: 28, mass: 1 },
  });
  const blockY = interpolate(blockEntry, [0, 1], [100, 0]);
  const blockOpacity = interpolate(blockEntry, [0, 0.25], [0, 1], {
    extrapolateRight: "clamp",
  });

  const lines = caption.split("\n");
  let wordIndex = 0;
  const WORD_DELAY = 4;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 32,
        right: 32,
        transform: `translateY(${blockY}px)`,
        opacity: blockOpacity,
        zIndex: 60,
        transformOrigin: "center bottom",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.78)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 24,
          padding: "28px 36px 32px",
          border: `2px solid ${accent}33`,
          boxShadow: `0 8px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${accent}18`,
        }}
      >
        {/* Accent top-bar */}
        <div
          style={{
            width: 48,
            height: 4,
            borderRadius: 999,
            background: accent,
            marginBottom: 20,
            boxShadow: `0 0 16px ${accent}`,
          }}
        />

        {lines.map((line, lineIdx) => {
          const words = line.split(" ").filter(Boolean);
          return (
            <div
              key={lineIdx}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0 0.25em",
                marginBottom: lineIdx < lines.length - 1 ? 8 : 0,
              }}
            >
              {words.map((word) => {
                const thisIndex = wordIndex++;
                const wordProgress = spring({
                  frame: frame - thisIndex * WORD_DELAY,
                  fps,
                  config: { stiffness: 380, damping: 18, mass: 0.7 },
                });
                const wordY = interpolate(wordProgress, [0, 1], [36, 0]);
                const wordOpacity = interpolate(
                  wordProgress,
                  [0, 0.25],
                  [0, 1],
                  { extrapolateRight: "clamp" }
                );
                const wordScale = interpolate(
                  wordProgress,
                  [0, 0.5, 1],
                  [1.4, 0.96, 1]
                );

                const isKey = thisIndex % 4 === 2;

                return (
                  <span
                    key={thisIndex}
                    style={{
                      display: "inline-block",
                      transform: `translateY(${wordY}px) scale(${wordScale})`,
                      opacity: wordOpacity,
                      color: isKey ? accent : "#fff",
                      fontSize: 58,
                      fontWeight: 900,
                      lineHeight: 1.2,
                      fontFamily: "'Inter', system-ui, sans-serif",
                      letterSpacing: isKey ? "-0.02em" : "-0.01em",
                      textShadow: isKey
                        ? `0 2px 24px ${accent}99, 0 1px 2px rgba(0,0,0,0.9)`
                        : "0 1px 4px rgba(0,0,0,0.9)",
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── BACKGROUND ───────────────────────────────────────────────────────────────
const Background: React.FC<{
  scene: Scene;
  accent: string;
  bg: string;
  sceneIndex: number;
}> = ({ accent, bg, sceneIndex }) => {
  const frame = useCurrentFrame();

  // Slow gradient drift for visual interest
  const driftX = interpolate(Math.sin(frame * 0.012 + sceneIndex), [-1, 1], [30, 70]);
  const driftY = interpolate(Math.cos(frame * 0.009 + sceneIndex * 2), [-1, 1], [10, 50]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Base gradient */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${bg} 0%, #000 40%, #0a0a12 100%)`,
        }}
      />
      {/* Accent orb */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 40% at ${driftX}% ${driftY}%, ${accent}22 0%, transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ── SINGLE SCENE ─────────────────────────────────────────────────────────────
const SceneView: React.FC<{
  scene: Scene;
  index: number;
  total: number;
}> = ({ scene, index, total }) => {
  const palette = PALETTES[index % PALETTES.length];

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* 0: Background */}
      <Background scene={scene} accent={palette.accent} bg={palette.bg} sceneIndex={index} />

      {/* 1: Kinetic gradient */}
      <KineticOverlay accent={palette.accent} />

      {/* 2: Particles */}
      <Particles accent={palette.accent} />

      {/* 3: Tag badge */}
      <TagBadge
        tag={scene.tag}
        accent={palette.accent}
        sceneIndex={index}
        total={total}
      />

      {/* 4: Caption */}
      <CaptionBlock caption={scene.caption} accent={palette.accent} />

      {/* 5: Light leak */}
      <LightLeak accent={palette.accent} />

      {/* 6: Grain */}
      <Grain />

      {/* Audio will be added by the agent when voiceover files exist */}
    </AbsoluteFill>
  );
};

// ── ROOT COMPOSITION ─────────────────────────────────────────────────────────
export const PromptVideo: React.FC<PromptVideoProps> = ({ timeline }) => {
  const { fps } = useVideoConfig();

  if (!timeline || !timeline.scenes || timeline.scenes.length === 0) {
    return (
      <AbsoluteFill
        style={{
          background: "#0a0a0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: "#666",
            fontSize: 48,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          No timeline data.
          <br />
          Submit a prompt to generate.
        </div>
      </AbsoluteFill>
    );
  }

  const totalScenes = timeline.scenes.length;
  const defaultDuration = Math.floor(
    timeline.totalDurationFrames / totalScenes
  );

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        {timeline.scenes.map((scene, i) => (
          <Series.Sequence
            key={scene.id}
            durationInFrames={scene.audioDurationFrames || defaultDuration}
          >
            <SceneView scene={scene} index={i} total={totalScenes} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
