import { generateDialog } from "./library.js";
import { generateBespokeButton, generateBespokeInput } from "./standard.js";

export interface ComponentDefinition {
  file: string;
  source: string;
  dependencies: Record<string, string>;
  description: string;
}

const control =
  "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50 disabled:pointer-events-none";
const panel =
  "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-foreground)]";
const overlay = "fixed inset-0 z-50 bg-[var(--color-background)]/80";
const floating = `${panel} z-50 max-h-[var(--radix-popper-available-height)] overflow-auto`;

function native(name: string, tag: string, classes = panel, defaults = ""): string {
  const d = defaults ? ` ${defaults}` : "";
  return `export function ${name}({ className = "", ...props }: ComponentProps<"${tag}">) {
  return <${tag}${d} className={\`${classes} \${className}\`} {...props} />;
}
`;
}

function wrap(name: string, part: string, classes = control, defaults = ""): string {
  const d = defaults ? ` ${defaults}` : "";
  return `export function ${name}({ className = "", ...props }: ComponentProps<typeof Primitive.${part}>) {
  return <Primitive.${part}${d} className={\`${classes} \${className}\`} {...props} />;
}
`;
}

function family(
  name: string,
  exports: string[],
  wrappers: [string, string, string?][] = [],
  extra = "",
): ComponentDefinition {
  const source = `import { ${name} as Primitive } from "radix-ui";
${wrappers.length || extra ? 'import type { ComponentProps } from "react";\n' : ""}
${exports.map((part) => `export const ${name}${part === "Root" ? "" : part} = Primitive.${part};`).join("\n")}
${wrappers.map(([suffix, part, classes]) => wrap(`${name}${suffix}`, part, classes)).join("\n")}
${extra}`;
  return {
    file: name,
    source,
    dependencies: { "radix-ui": "^1.6.7" },
    description: `${name}: project-owned Radix foundation`,
  };
}

function html(
  file: string,
  definitions: [string, string, string?, string?][],
): ComponentDefinition {
  return {
    file,
    dependencies: {},
    description: `${file}: semantic project-owned foundation`,
    source: `import type { ComponentProps } from "react";\n\n${definitions.map(([name, tag, classes, defaults]) => native(name, tag, classes, defaults)).join("\n")}`,
  };
}

function portalContent(name: string, bodyClass = floating): string {
  return `export function ${name}Content({ className = "", ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content className={\`${bodyClass} \${className}\`} {...props} /></Primitive.Portal>;
}
`;
}

function slidingPanel(name: string, position: string): ComponentDefinition {
  return {
    file: name,
    dependencies: { "@radix-ui/react-dialog": "^1.1.6" },
    description: `${name}: accessible ${name === "Drawer" ? "bottom panel (no drag gesture)" : "side panel"}`,
    source: `import * as Primitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
export const ${name} = Primitive.Root;
export const ${name}Trigger = Primitive.Trigger;
export const ${name}Close = Primitive.Close;
export const ${name}Title = Primitive.Title;
export const ${name}Description = Primitive.Description;
export function ${name}Content({ className = "", children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Overlay className="${overlay}" />
    <Primitive.Content className={\`fixed z-50 overflow-y-auto ${position} ${panel} \${className}\`} {...props}>
      {children}
      <Primitive.Close className="${control} mt-4">Close</Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>;
}
`,
  };
}

export const COMPONENTS: Record<string, ComponentDefinition> = {
  button: {
    file: "Button",
    source: generateBespokeButton(),
    dependencies: { "@radix-ui/react-slot": "^1.1.2" },
    description: "Button with variants and asChild composition",
  },
  input: {
    file: "Input",
    source: generateBespokeInput(),
    dependencies: {},
    description: "Input with accessible error state",
  },
  dialog: {
    file: "Dialog",
    source: generateDialog(),
    dependencies: { "@radix-ui/react-dialog": "^1.1.6" },
    description: "Accessible modal dialog",
  },
  accordion: family(
    "Accordion",
    ["Root"],
    [
      ["Item", "Item", "border-b border-[var(--color-border)]"],
      ["Content", "Content", "py-3"],
    ],
    `export function AccordionTrigger({ className = "", children, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Header><Primitive.Trigger className={\`w-full text-left ${control} \${className}\`} {...props}>{children}</Primitive.Trigger></Primitive.Header>;
}`,
  ),
  "alert-dialog": family(
    "AlertDialog",
    ["Root", "Trigger", "Title", "Description"],
    [
      ["Action", "Action"],
      ["Cancel", "Cancel"],
    ],
    `export function AlertDialogContent({ className = "", ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Overlay className="${overlay}" /><Primitive.Content className={\`fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 ${panel} \${className}\`} {...props} /></Primitive.Portal>;
}`,
  ),
  "aspect-ratio": family("AspectRatio", ["Root"]),
  avatar: family(
    "Avatar",
    [],
    [
      ["", "Root", "relative inline-flex size-10 shrink-0 overflow-hidden rounded-full"],
      ["Image", "Image", "size-full object-cover"],
      [
        "Fallback",
        "Fallback",
        "flex size-full items-center justify-center bg-[var(--color-surface)]",
      ],
    ],
  ),
  checkbox: family(
    "Checkbox",
    ["Indicator"],
    [],
    `export function Checkbox({ className = "", children, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={\`inline-flex size-6 items-center justify-center ${control} p-0 \${className}\`} {...props}>{children ?? <Primitive.Indicator aria-hidden="true">✓</Primitive.Indicator>}</Primitive.Root>;
}`,
  ),
  collapsible: family("Collapsible", ["Root", "Trigger", "Content"]),
  "context-menu": family(
    "ContextMenu",
    ["Root", "Trigger", "Group", "RadioGroup", "Sub", "SubTrigger", "SubContent", "ItemIndicator"],
    [
      ["Item", "Item"],
      ["CheckboxItem", "CheckboxItem"],
      ["RadioItem", "RadioItem"],
      ["Label", "Label", "px-3 py-1 font-medium"],
      ["Separator", "Separator", "h-px bg-[var(--color-border)]"],
    ],
    portalContent("ContextMenu"),
  ),
  "dropdown-menu": family(
    "DropdownMenu",
    ["Root", "Trigger", "Group", "RadioGroup", "Sub", "SubTrigger", "SubContent", "ItemIndicator"],
    [
      ["Item", "Item"],
      ["CheckboxItem", "CheckboxItem"],
      ["RadioItem", "RadioItem"],
      ["Label", "Label", "px-3 py-1 font-medium"],
      ["Separator", "Separator", "h-px bg-[var(--color-border)]"],
    ],
    portalContent("DropdownMenu"),
  ),
  "hover-card": family("HoverCard", ["Root", "Trigger", "Arrow"], [], portalContent("HoverCard")),
  label: family("Label", [], [["", "Root", "text-sm font-medium"]]),
  menubar: family(
    "Menubar",
    ["Menu", "Group", "Sub", "SubTrigger", "SubContent", "RadioGroup", "ItemIndicator"],
    [
      ["", "Root", `flex gap-1 ${panel}`],
      ["Trigger", "Trigger"],
      ["Item", "Item"],
      ["CheckboxItem", "CheckboxItem"],
      ["RadioItem", "RadioItem"],
      ["Label", "Label", "font-medium"],
      ["Separator", "Separator", "h-px bg-[var(--color-border)]"],
    ],
    portalContent("Menubar"),
  ),
  "navigation-menu": family(
    "NavigationMenu",
    ["Root", "Item", "Indicator", "Viewport"],
    [
      ["List", "List", "flex flex-wrap gap-2"],
      ["Trigger", "Trigger"],
      ["Link", "Link"],
      ["Content", "Content", panel],
    ],
  ),
  popover: family(
    "Popover",
    ["Root", "Trigger", "Anchor", "Close", "Arrow"],
    [],
    portalContent("Popover"),
  ),
  progress: family(
    "Progress",
    [],
    [],
    `export function Progress({ value = 0, max = 100, className = "", ...props }: ComponentProps<typeof Primitive.Root>) {
  const percent = value === null ? 0 : Math.min(100, Math.max(0, value / max * 100));
  return <Primitive.Root value={value} max={max} className={\`h-2 overflow-hidden rounded-full bg-[var(--color-surface)] \${className}\`} {...props}>
    <Primitive.Indicator className="h-full bg-[var(--color-primary)]" style={{ width: value === null ? "100%" : percent + "%" }} />
  </Primitive.Root>;
}`,
  ),
  "radio-group": family(
    "RadioGroup",
    ["Root"],
    [],
    `export function RadioGroupItem({ className = "", children, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={\`size-6 rounded-full border border-[var(--color-border)] ${control} p-0 \${className}\`} {...props}>{children ?? <Primitive.Indicator className="block size-3 mx-auto rounded-full bg-[var(--color-primary)]" />}</Primitive.Item>;
}`,
  ),
  "scroll-area": family(
    "ScrollArea",
    [],
    [],
    `export function ScrollArea({ className = "", children, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={\`relative overflow-hidden \${className}\`} {...props}>
    <Primitive.Viewport className="size-full rounded-[inherit]">{children}</Primitive.Viewport>
    <Primitive.Scrollbar orientation="vertical" className="flex w-2"><Primitive.Thumb className="relative flex-1 rounded-full bg-[var(--color-border)]" /></Primitive.Scrollbar>
    <Primitive.Scrollbar orientation="horizontal" className="flex h-2"><Primitive.Thumb className="relative flex-1 rounded-full bg-[var(--color-border)]" /></Primitive.Scrollbar>
    <Primitive.Corner />
  </Primitive.Root>;
}`,
  ),
  select: family(
    "Select",
    ["Root", "Value", "Group", "Label", "Separator"],
    [["Trigger", "Trigger", `inline-flex items-center gap-2 ${control}`]],
    `export function SelectContent({ className = "", children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content position="popper" className={\`${floating} \${className}\`} {...props}>
    <Primitive.ScrollUpButton aria-label="Scroll up">▲</Primitive.ScrollUpButton>
    <Primitive.Viewport>{children}</Primitive.Viewport><Primitive.ScrollDownButton aria-label="Scroll down">▼</Primitive.ScrollDownButton>
  </Primitive.Content></Primitive.Portal>;
}
export function SelectItem({ className = "", children, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={\`${control} \${className}\`} {...props}><Primitive.ItemText>{children}</Primitive.ItemText><Primitive.ItemIndicator aria-hidden="true">✓</Primitive.ItemIndicator></Primitive.Item>;
}`,
  ),
  separator: family(
    "Separator",
    [],
    [
      [
        "",
        "Root",
        "bg-[var(--color-border)] data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:h-full",
      ],
    ],
  ),
  slider: family(
    "Slider",
    [],
    [],
    `export function Slider({ className = "", value, defaultValue = [50], thumbLabels = ["Value"], ...props }: ComponentProps<typeof Primitive.Root> & { thumbLabels?: string[] }) {
  return <Primitive.Root value={value} defaultValue={defaultValue} className={\`relative flex h-6 w-full touch-none items-center data-[orientation=vertical]:h-48 data-[orientation=vertical]:w-6 data-[orientation=vertical]:flex-col \${className}\`} {...props}>
    <Primitive.Track className="relative grow h-2 data-[orientation=vertical]:w-2 rounded-full bg-[var(--color-surface)]"><Primitive.Range className="absolute h-full data-[orientation=vertical]:w-full bg-[var(--color-primary)]" /></Primitive.Track>
    {(value ?? defaultValue).map((_, index) => <Primitive.Thumb key={index} aria-label={thumbLabels[index] ?? "Value " + (index + 1)} className="block size-6 rounded-full bg-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2" />)}
  </Primitive.Root>;
}`,
  ),
  switch: family(
    "Switch",
    [],
    [],
    `export function Switch({ className = "", children, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={\`inline-flex h-6 w-11 items-center rounded-full bg-[var(--color-border)] data-[state=checked]:bg-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 \${className}\`} {...props}>{children ?? <Primitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-[var(--color-foreground)] data-[state=checked]:translate-x-5" />}</Primitive.Root>;
}`,
  ),
  tabs: family(
    "Tabs",
    ["Root"],
    [
      ["List", "List", "flex gap-2 border-b border-[var(--color-border)]"],
      [
        "Trigger",
        "Trigger",
        `${control} data-[state=active]:bg-[var(--color-primary)] data-[state=active]:text-[var(--color-primary-foreground)]`,
      ],
      ["Content", "Content", "py-4"],
    ],
  ),
  toast: family(
    "Toast",
    ["Provider", "Title", "Description", "Action", "Close"],
    [
      ["", "Root", panel],
      ["Viewport", "Viewport", "fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"],
    ],
  ),
  toggle: family(
    "Toggle",
    [],
    [
      [
        "",
        "Root",
        `${control} data-[state=on]:bg-[var(--color-primary)] data-[state=on]:text-[var(--color-primary-foreground)]`,
      ],
    ],
  ),
  "toggle-group": family(
    "ToggleGroup",
    ["Root"],
    [
      [
        "Item",
        "Item",
        `${control} data-[state=on]:bg-[var(--color-primary)] data-[state=on]:text-[var(--color-primary-foreground)]`,
      ],
    ],
  ),
  tooltip: family(
    "Tooltip",
    ["Provider", "Root", "Trigger", "Arrow"],
    [],
    portalContent("Tooltip"),
  ),
  sheet: slidingPanel("Sheet", "inset-y-0 right-0 w-full max-w-md"),
  drawer: slidingPanel("Drawer", "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[var(--radius-sm)]"),
  card: html("Card", [
    ["Card", "div"],
    ["CardHeader", "div", "mb-4"],
    ["CardTitle", "h3", "text-lg font-semibold"],
    ["CardDescription", "p", "text-[var(--color-muted-foreground)]"],
    ["CardContent", "div", ""],
    ["CardFooter", "div", "mt-4 flex items-center gap-2"],
  ]),
  badge: html("Badge", [
    [
      "Badge",
      "span",
      "inline-flex rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs",
    ],
  ]),
  textarea: html("Textarea", [["Textarea", "textarea", `${control} min-h-24 w-full text-base`]]),
  table: html("Table", [
    ["Table", "table", "w-full text-sm"],
    ["TableHeader", "thead", "border-b border-[var(--color-border)]"],
    ["TableBody", "tbody", ""],
    ["TableFooter", "tfoot", "border-t border-[var(--color-border)]"],
    ["TableRow", "tr", "border-b border-[var(--color-border)]"],
    ["TableHead", "th", "p-3 text-left font-medium", 'scope="col"'],
    ["TableCell", "td", "p-3"],
    ["TableCaption", "caption", "p-3 text-[var(--color-muted-foreground)]"],
  ]),
  skeleton: html("Skeleton", [
    [
      "Skeleton",
      "div",
      "rounded-[var(--radius-sm)] bg-[var(--color-border)] motion-safe:animate-pulse",
      'aria-hidden="true"',
    ],
  ]),
  alert: html("Alert", [
    ["Alert", "div", panel, 'role="alert"'],
    ["AlertTitle", "h4", "font-medium"],
    ["AlertDescription", "div", "text-sm text-[var(--color-muted-foreground)]"],
  ]),
  breadcrumb: html("Breadcrumb", [
    ["Breadcrumb", "nav", "", 'aria-label="Breadcrumb"'],
    ["BreadcrumbList", "ol", "flex flex-wrap items-center gap-2"],
    ["BreadcrumbItem", "li", "inline-flex gap-2"],
    ["BreadcrumbLink", "a", "underline-offset-4 hover:underline"],
    ["BreadcrumbPage", "span", "font-medium", 'aria-current="page"'],
    ["BreadcrumbSeparator", "li", "", 'aria-hidden="true"'],
  ]),
  pagination: html("Pagination", [
    ["Pagination", "nav", "", 'aria-label="Pagination"'],
    ["PaginationContent", "ul", "flex items-center gap-2"],
    ["PaginationItem", "li", ""],
    ["PaginationLink", "a", control],
  ]),
  spinner: html("Spinner", [
    [
      "Spinner",
      "span",
      "inline-block size-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)] motion-safe:animate-spin",
      'role="status" aria-label="Loading"',
    ],
  ]),
  "native-select": html("NativeSelect", [
    ["NativeSelect", "select", control],
    ["NativeSelectOption", "option", ""],
    ["NativeSelectGroup", "optgroup", ""],
  ]),
  field: html("Field", [
    ["Field", "fieldset", "flex flex-col gap-2"],
    ["FieldLegend", "legend", "font-medium"],
    ["FieldLabel", "label", "text-sm font-medium"],
    ["FieldDescription", "p", "text-sm text-[var(--color-muted-foreground)]"],
    ["FieldError", "p", "text-sm text-[var(--color-danger)]", 'role="alert"'],
  ]),
  "button-group": html("ButtonGroup", [
    ["ButtonGroup", "div", "inline-flex flex-wrap gap-1", 'role="group"'],
  ]),
  kbd: html("Kbd", [
    [
      "Kbd",
      "kbd",
      "rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1 text-xs font-mono",
    ],
  ]),
};
