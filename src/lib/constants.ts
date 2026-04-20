// ── Constants ─────────────────────────────────────────────────────────────────

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Directory where prompt job files are written */
export const PROMPTS_DIR = ".prompts";

/** Directory where rendered videos are output */
export const OUTPUT_DIR = "out";

/** Default ElevenLabs voice ID (Rachel — clear, professional) */
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** Scene-level color palettes for visual variety */
export const PALETTES = [
  { accent: "#818cf8", bg: "#0f0d2e" }, // Indigo
  { accent: "#34d399", bg: "#021a12" }, // Emerald
  { accent: "#f472b6", bg: "#1f0515" }, // Pink
  { accent: "#60a5fa", bg: "#0a1628" }, // Blue
  { accent: "#fbbf24", bg: "#1a1400" }, // Amber
  { accent: "#a78bfa", bg: "#150d2e" }, // Violet
  { accent: "#2dd4bf", bg: "#021a1a" }, // Teal
  { accent: "#fb923c", bg: "#1a0c00" }, // Orange
] as const;
