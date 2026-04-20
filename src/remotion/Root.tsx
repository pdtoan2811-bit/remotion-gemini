import { Composition, getStaticFiles } from "remotion";
import { PromptVideo, PromptVideoProps } from "./PromptVideo";
import { FPS, WIDTH, HEIGHT } from "../lib/constants";

/**
 * RemotionRoot — Dynamically discovers compositions from .prompts/ output.
 *
 * Each completed prompt job creates a folder in public/content/{id}/ with a
 * timeline.json. This root scans static files for those timelines and registers
 * each as a Remotion composition.
 */
export const RemotionRoot: React.FC = () => {
  const staticFiles = getStaticFiles();

  // Find all timeline.json files in content directories
  const timelines = staticFiles
    .filter((file) => file.name.endsWith("timeline.json"))
    .map((file) => {
      const parts = file.name.split("/");
      // Expected path: content/{compositionId}/timeline.json
      return parts.length >= 2 ? parts[parts.length - 2] : null;
    })
    .filter((name): name is string => name !== null);

  return (
    <>
      {/* ── Default placeholder composition for Studio preview ──────── */}
      <Composition
        id="prompt-video-preview"
        component={PromptVideo}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={
          {
            timeline: {
              scenes: [
                {
                  id: "preview",
                  caption: "Submit a prompt\nto generate\nyour video",
                  tag: "🎬 READY",
                  voiceoverText: "",
                  imageDescription: "",
                },
              ],
              totalDurationFrames: FPS * 10,
            },
          } satisfies PromptVideoProps
        }
      />

      {/* ── Dynamically discovered compositions from completed jobs ── */}
      {timelines.map((compositionId) => (
        <Composition
          key={compositionId}
          id={compositionId}
          component={PromptVideo}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          durationInFrames={FPS * 60} // placeholder, overridden by calculateMetadata
          defaultProps={
            {
              timeline: null as unknown as PromptVideoProps["timeline"],
            } satisfies PromptVideoProps
          }
          calculateMetadata={async () => {
            const resp = await fetch(
              `http://localhost:3000/public/content/${compositionId}/timeline.json`
            );
            const timeline = await resp.json();
            return {
              durationInFrames: timeline.totalDurationFrames || FPS * 60,
              props: { timeline },
            };
          }}
        />
      ))}
    </>
  );
};
