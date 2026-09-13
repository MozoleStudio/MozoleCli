import path from "node:path";
import { atomicWrite, exists, writeFiles } from "../utils/fs.js";
import { generateBespokeButton, generateBespokeInput } from "./standard.js";

export function generateDialog(): string {
  return `import * as Primitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;

export function DialogContent({
  children,
  className = "",
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-[var(--color-background)]/80" />
      <Primitive.Content
        className={\`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] focus:outline-none \${className}\`}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
`;
}

export async function scaffoldLibrary(root: string): Promise<void> {
  await writeFiles(root, {
    "src/components/ui/Button.tsx": generateBespokeButton(),
    "src/components/ui/Input.tsx": generateBespokeInput(),
    "src/components/ui/Dialog.tsx": generateDialog(),
    "src/components/layout/Container.tsx": `import type { ComponentProps } from "react";

export function Container({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={\`mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-container-gutter)] \${className}\`}
      {...props}
    />
  );
}
`,
    "src/components/features/index.ts": "export {};\n",
    "src/components/sections/index.ts": "export {};\n",
    "src/components/motion/index.ts": "export {};\n",
    "src/behaviors/index.ts": "export {};\n",
    "src/components/motion/README.md":
      "# Project motion\n\nOwn animation components here. Standard has no required motion runtime; Flagship uses Motion.\n",
    "src/behaviors/README.md":
      "# Project behaviors\n\nOwn hooks and interaction policies here. Never import implementations from sibling projects.\n",
    "docs/library.md":
      "# Project library\n\nImport UI from src/components/ui, layouts from src/components/layout, and the project library from src/library. Every implementation and token belongs to this project. Prototype workspaces share npm dependencies only.\n\nCompose Dialog with DialogTrigger, DialogContent, DialogTitle, DialogDescription and DialogClose. Provide an accessible title and a visible close control; use aria-describedby={undefined} when intentionally omitting a description.\n\nEach independent primitive must have its own named file; related Dialog parts may share Dialog.tsx. Add reusable feature components in src/components/features and independent sections in src/components/sections. Pages compose sections. Adding a component requires an explicit export in its local index.ts. Keep backend access in project-owned services and pass data/actions into visual components. Keep primitives independent of routes and backend. Follow docs/workflow.md and docs/toolkit.md; design direction comes from the conversation. Do not create a /ui gallery unless requested.\n",
  });
  const indexes: Record<string, string[]> = {
    "src/components/ui/index.ts": [
      'export * from "./Button";',
      'export * from "./Input";',
      'export * from "./Dialog";',
    ],
    "src/components/layout/index.ts": ['export { Container } from "./Container";'],
    "src/library/index.ts": [
      'export * from "../components/ui";',
      'export * from "../components/layout";',
      'export * from "../components/features";',
      'export * from "../components/sections";',
      'export * from "../components/motion";',
      'export * from "../behaviors";',
    ],
  };
  for (const component of ["Header", "Footer"]) {
    if (await exists(path.join(root, `src/components/layout/${component}.tsx`))) {
      indexes["src/components/layout/index.ts"].push(`export * from "./${component}";`);
    }
  }
  for (const [file, exports] of Object.entries(indexes)) {
    const target = path.join(root, file);
    // Existing custom barrels may expose different symbols; adoption reports them for review.
    if (!(await exists(target))) await atomicWrite(target, `${exports.join("\n")}\n`);
  }
  const manifest = path.join(root, ".mozole", "library.json");
  if (!(await exists(manifest))) {
    await atomicWrite(
      manifest,
      JSON.stringify(
        {
          ownership: "project",
          entry: "src/library/index.ts",
          ui: "src/components/ui",
          layout: "src/components/layout",
          features: "src/components/features",
          sections: "src/components/sections",
          motion: "src/components/motion",
          behavior: "src/behaviors",
        },
        null,
        2,
      ),
    );
  }
}
