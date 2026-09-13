import path from "node:path";
import { exists, writeFiles } from "../utils/fs.js";

export function generateDesignReadme(): string {
  return `# Design References

The user determines the design direction in conversation. Root design.md (if supplied),
this directory's design.md and brief.md, and extracted Stitch/Superdesign prototypes
are supporting references only. None overrides current user instructions.

Preserve original exports. Do not execute exported scripts, install their dependencies,
or copy their architecture/styles wholesale. Translate relevant textual/source details
into the project component structure within the user's requested scope.

Never independently render, capture, diff or visually inspect reference screens or the
application. The user supplies screenshots and specific feedback when needed; analyze
those supplied images only for that correction. Headless technical checks are separate
from visual approval and may run only when validation is authorized.

See ../workflow.md for production order, ../decisions.md for settled conversation choices,
and ../toolkit.md for commands. Do not generate an extra design.md when the user already
provides one elsewhere, or rewrite originals to match agent assumptions.
`;
}

export function generateDesignMd(projectName: string): string {
  return `# Design Reference - ${projectName}

Supporting reference only. Design direction is determined in conversation, not by this
file or the starter template. Leave unspecified choices open until the user directs them.

## Reference notes
- Brand/context: not specified.
- Relevant prototype files: not specified.
- Useful patterns or constraints mentioned by the user: not specified.

Settled conversation decisions belong in ../decisions.md. Do not invent an approved
palette, typography, atmosphere or animation style from scaffold defaults.
`;
}

export function generateBriefMd(projectName: string): string {
  return `# Brief Reference - ${projectName}

Supplemental context; current user instructions take precedence.

- Audience and business objective: not specified.
- Requested pages and sections: not specified.
- Requested current stage: determined in conversation.
- Backend/customer panel requirements: not specified.

Record agreed scope in ../decisions.md. Do not infer extra pages, panels or features.
`;
}

export async function scaffoldDesign(projectRoot: string, projectName: string): Promise<void> {
  const files: Record<string, string> = {
    "docs/design/README.md": generateDesignReadme(),
    "docs/design/brief.md": generateBriefMd(projectName),
    "docs/design/assets/.gitkeep": "",
    "docs/design/screens/.gitkeep": "",
  };
  if (!(await exists(path.join(projectRoot, "design.md")))) {
    files["docs/design/design.md"] = generateDesignMd(projectName);
  }
  await writeFiles(projectRoot, files);
}
