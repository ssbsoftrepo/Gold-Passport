/**
 * Field-app palette. Same identity as the web back office (mineral slate + hallmark gold), tuned
 * for outdoor use: large type, high contrast, generous touch targets (min 48dp).
 */
export const colors = {
  ink: "#1e2b2f",
  inkSoft: "#4a5a5e",
  inkFaint: "#7d8b8e",
  andesite: "#e9ece8",
  paper: "#fbfcfa",
  rule: "#d3d9d4",
  slate: "#23363a",
  slateText: "#dfe6e3",
  gold: "#8a6512",
  goldBright: "#c99a2e",
  goldWash: "#f4ead2",
  jade: "#2f6f57",
  jadeWash: "#dcebe3",
  cinnabar: "#a63a24",
  cinnabarWash: "#f5e0da",
  amberWash: "#f3e7c9",
  amberInk: "#6b4d0c",
  white: "#ffffff",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  small: 14,
  body: 16,
  large: 18,
  title: 24,
  hero: 30,
} as const;

export const radius = { panel: 8, control: 6, tag: 4 } as const;
