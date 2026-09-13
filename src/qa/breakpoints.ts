import postcss from "postcss";

export interface ViewportDefinition {
  name: string;
  width: number;
  height: number;
}

export const STANDARD_VIEWPORTS: ViewportDefinition[] = [
  { name: "mobile-min", width: 320, height: 800 },
  { name: "mobile-small", width: 375, height: 812 },
  { name: "mobile-standard", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop-compact", width: 1280, height: 800 },
  { name: "desktop-standard", width: 1440, height: 900 },
  { name: "desktop-wide", width: 1920, height: 1080 },
];

/**
 * Extracts breakpoint boundary widths from CSS sources.
 * For every detected min-width or max-width query, generates width - 1, width, and width + 1,
 * ensuring boundary conditions never cause accidental horizontal overflow or control collisions.
 */
export function extractBreakpointBoundaries(
  cssSources: string[],
  options?: { minWidth?: number; maxWidth?: number },
): number[] {
  const min = options?.minWidth ?? 320;
  const max = options?.maxWidth ?? 2560;
  const boundaries = new Set<number>([320, 375, 390, 768, 1024, 1280, 1440, 1920]);

  for (const css of cssSources) {
    try {
      const root = postcss.parse(css);
      root.walkAtRules("media", (rule) => {
        const matches = rule.params.matchAll(
          /(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi,
        );
        for (const match of matches) {
          const rawVal = Number.parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          const point = Math.round(rawVal * (unit === "px" ? 1 : 16));

          for (const delta of [-1, 0, 1]) {
            const candidate = point + delta;
            if (candidate >= min && candidate <= max) {
              boundaries.add(candidate);
            }
          }
        }
      });
    } catch {
      // Ignore unparseable CSS chunks
    }
  }

  return Array.from(boundaries).sort((a, b) => a - b);
}
