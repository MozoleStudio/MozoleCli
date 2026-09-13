export interface ProbeIssue {
  selector: string;
  text?: string;
  problem?: string;
  family?: string;
  weight?: string;
  size?: string | number;
  width?: number;
  height?: number;
  left?: number;
  right?: number;
  viewport?: number;
  ancestor?: string;
  value?: string;
  policy?: string;
  animation?: string;
  duration?: string;
  line?: { left: number; right: number; top: number; bottom: number };
}

export interface ProbeResult {
  url: string;
  viewport: { width: number; height: number };
  loadedFonts: string[];
  issues: {
    overflow: ProbeIssue[];
    clipping: ProbeIssue[];
    typography: ProbeIssue[];
    shadows: ProbeIssue[];
    targets: ProbeIssue[];
    semantics: ProbeIssue[];
    motion: ProbeIssue[];
  };
}

/**
 * Executes entirely inside browser context; zero screenshots, pixel comparisons,
 * or external dependencies. Analyzes live DOM geometry, font metrics, and WCAG rules.
 */
export function probeDOM(): ProbeResult {
  const issues: Record<string, ProbeIssue[]> = {
    overflow: [],
    clipping: [],
    typography: [],
    shadows: [],
    targets: [],
    semantics: [],
    motion: [],
  };

  const identify = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const classes = Array.from(el.classList);
    return `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`;
  };

  const visible = (el: Element): boolean => {
    if ("checkVisibility" in el && typeof (el as HTMLElement).checkVisibility === "function") {
      if (
        !(el as HTMLElement).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      ) {
        return false;
      }
    }
    const rect = el.getBoundingClientRect();
    return Boolean(rect.width && rect.height);
  };

  const ignored = (el: Element): boolean => {
    return Boolean(el.closest('[aria-hidden="true"], [inert]'));
  };

  const add = (rule: string, el: Element, detail: Record<string, unknown>) => {
    const textSnippet = el.textContent?.trim().slice(0, 80);
    issues[rule].push({
      selector: identify(el),
      text: textSnippet,
      ...detail,
    });
  };

  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth + 1) {
    issues.overflow.push({
      selector: "html",
      width: root.scrollWidth,
      viewport: window.innerWidth,
      problem: "page-horizontal-overflow",
    });
  }

  const rootStyle = window.getComputedStyle(root);
  const allowedFonts = ["--font-display", "--font-body", "--font-interface"].map((name) =>
    rootStyle.getPropertyValue(name).trim().split(",")[0].replace(/["']/g, "").trim(),
  );

  const fontSet = (document as unknown as { fonts?: Set<FontFace> }).fonts;
  const loadedFonts: string[] = [];
  if (fontSet) {
    for (const f of fontSet) {
      if (f.status === "loaded") {
        loadedFonts.push(f.family.replace(/["']/g, ""));
      }
      if (f.status === "error") {
        issues.typography.push({
          selector: "@font-face",
          problem: "font-load-error",
          family: f.family,
          weight: f.weight,
        });
      }
    }
  }

  const ids = new Set<string>();
  const elements = document.querySelectorAll("body *");

  for (const el of Array.from(elements)) {
    if (el.id) {
      if (ids.has(el.id)) {
        add("semantics", el, { problem: "duplicate-id" });
      }
      ids.add(el.id);
    }

    if (!visible(el) || ignored(el)) continue;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    // Accessible offscreen text is intentionally clipped (.sr-only or skip-link), not a defect
    if (
      (rect.width <= 1 &&
        rect.height <= 1 &&
        (style.clip !== "auto" || style.clipPath !== "none")) ||
      el.matches(".sr-only, .skip-link:not(:focus)")
    ) {
      continue;
    }

    const directText = Array.from(el.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent?.trim() ?? "").length > 0,
    );
    const meaningful =
      directText.length > 0 || el.matches("img, input, select, textarea, button, svg, canvas");

    // Local scroll containers are legitimate reflow exceptions
    let scrollContainer: HTMLElement | null = null;
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const parentStyle = window.getComputedStyle(parent);
      if (
        /(auto|scroll)/.test(parentStyle.overflowX) &&
        parent.scrollWidth > parent.clientWidth + 1
      ) {
        scrollContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }

    if (meaningful && !scrollContainer && (rect.left < -1 || rect.right > window.innerWidth + 1)) {
      add("overflow", el, {
        left: rect.left,
        right: rect.right,
        viewport: window.innerWidth,
        problem: "element-outside-viewport",
      });
    }

    if (directText.length > 0) {
      const size = Number.parseFloat(style.fontSize);
      const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();

      if (size < 11.9) {
        add("typography", el, { problem: "project-font-floor-12px", size });
      }

      if (
        allowedFonts.length > 0 &&
        allowedFonts.some((f) => f.length > 0) &&
        !allowedFonts.includes(family) &&
        !family.includes("sans-serif") &&
        !family.includes("system-ui")
      ) {
        add("typography", el, { problem: "non-token-font-family", family });
      }

      // Check text clipping against overflow:hidden / clip ancestors
      for (const node of directText) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const clientRects = Array.from(range.getClientRects());

        for (const line of clientRects) {
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== document.documentElement) {
            const aStyle = window.getComputedStyle(ancestor);
            // Local scroll containers handle overflowing content via scrolling; do not flag as defects
            if (/(auto|scroll)/.test(aStyle.overflowX) || /(auto|scroll)/.test(aStyle.overflowY)) {
              break;
            }
            const aRect = ancestor.getBoundingClientRect();
            const clipX = /^(hidden|clip)$/.test(aStyle.overflowX);
            const clipY = /^(hidden|clip)$/.test(aStyle.overflowY);

            if (
              (clipX && (line.left < aRect.left - 2 || line.right > aRect.right + 2)) ||
              (clipY && (line.top < aRect.top - 2 || line.bottom > aRect.bottom + 2))
            ) {
              add("clipping", el, {
                ancestor: identify(ancestor),
                problem: "text-range-outside-clip",
                line: {
                  left: line.left,
                  right: line.right,
                  top: line.top,
                  bottom: line.bottom,
                },
              });
              break;
            }
            ancestor = ancestor.parentElement;
          }
        }
      }
    }

    // Input font floor: 16px minimum on mobile prevents iOS auto-zoom
    if (
      el.matches(
        "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea",
      ) &&
      Number.parseFloat(style.fontSize) < 16
    ) {
      add("typography", el, {
        problem: "input-font-floor-16px",
        size: style.fontSize,
      });
    }

    // Touch targets: minimum 24px for standalone interactive controls (WCAG 2.5.8)
    if (
      el.matches("button, input[type=button], input[type=submit], input[type=range], .btn") &&
      (rect.width < 24 || rect.height < 24)
    ) {
      add("targets", el, {
        width: rect.width,
        height: rect.height,
        policy: "24px-min-standalone-target",
      });
    }

    // Prefers reduced motion check
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (style.scrollBehavior === "smooth") {
        add("motion", el, { problem: "smooth-scroll-under-reduced-motion" });
      }
      const durations = style.animationDuration.split(",").map(Number.parseFloat);
      if (style.animationName !== "none" && durations.some((d) => d > 0.01)) {
        add("motion", el, {
          animation: style.animationName,
          duration: style.animationDuration,
          problem: "active-animation-under-reduced-motion",
        });
      }
    }
  }

  // Deduplicate issues
  for (const key of Object.keys(issues)) {
    const map = new Map<string, ProbeIssue>();
    for (const item of issues[key]) {
      map.set(JSON.stringify(item), item);
    }
    issues[key] = Array.from(map.values());
  }

  return {
    url: window.location.pathname,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    loadedFonts,
    issues: issues as unknown as ProbeResult["issues"],
  };
}

export const PROBE_DOM_FN_STRING = probeDOM.toString();
