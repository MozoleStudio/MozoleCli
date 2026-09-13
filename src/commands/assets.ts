import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { scaffoldToolsGuide } from "../scaffold/tools-guide.js";
import { atomicWrite, exists, writeFiles } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { projectDirectory, projectPath, regularFiles } from "../utils/project-files.js";

export const IMAGE_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1600, 1920, 2560, 3840];
export interface AssetOptions {
  cwd?: string;
  input?: string;
  output?: string;
  widths?: string;
  quality?: number;
  base?: string;
  log?: (message: string) => void;
}
export interface OptimizedImage {
  src: string;
  width: number;
  height: number;
  sources: { type: string; srcSet: string }[];
  variants: { src: string; width: number; height: number; bytes: number; format: string }[];
}

export async function optimizeAssets(
  options: AssetOptions = {},
): Promise<Record<string, OptimizedImage>> {
  const log = options.log ?? console.log;
  const root = await projectDirectory(options.cwd);
  const input = await projectPath(root, options.input ?? "assets/images");
  const output = await projectPath(root, options.output ?? "public/media");
  const publicRoot = path.join(root, "public");
  if (!output.startsWith(publicRoot + path.sep))
    throw new Error("Asset output must be a subdirectory of public/.");
  if (
    output === input ||
    output.startsWith(input + path.sep) ||
    input.startsWith(output + path.sep)
  )
    throw new Error("Input and output directories must not overlap.");
  const widths = options.widths
    ? [...new Set(options.widths.split(",").map(Number))].sort((a, b) => a - b)
    : IMAGE_WIDTHS;
  if (
    !widths.length ||
    widths.length > 20 ||
    widths.some((width) => !Number.isInteger(width) || width < 1 || width > 7680)
  )
    throw new Error("Widths must contain 1–20 integer sizes between 1 and 7680.");
  const quality = options.quality ?? 78;
  if (!Number.isInteger(quality) || quality < 1 || quality > 100)
    throw new Error("Quality must be an integer from 1 to 100.");
  const base = options.base ?? "/";
  if (
    !base.startsWith("/") ||
    base.startsWith("//") ||
    /[?#\\\s]/.test(base) ||
    base.split("/").includes("..")
  )
    throw new Error("Base must be a site path such as / or /client/.");
  const prefix = `${base.replace(/\/$/, "")}/${path.relative(publicRoot, output).split(path.sep).map(encodeURIComponent).join("/")}`;
  for (const file of [
    "src/assets/images.generated.ts",
    "src/components/ui/ResponsiveImage.tsx",
    "src/components/ui/index.ts",
    "src/library/index.ts",
    `${path.relative(root, output)}/manifest.json`,
  ])
    await projectPath(root, file);
  const candidates = (await regularFiles(input)).filter((file) =>
    /\.(jpe?g|png|webp|avif|tiff?|gif)$/i.test(file),
  );
  if (!candidates.length) throw new Error(`No supported raster images found in ${input}.`);
  const { default: sharp } = await import("sharp");
  const images: Record<string, OptimizedImage> = {};
  const skipped: string[] = [];
  for (const file of candidates) {
    const source = path.join(input, file);
    if ((await stat(source)).size > 50 * 1024 * 1024)
      throw new Error(`Image exceeds 50 MB: ${file}`);
    const buffer = await readFile(source);
    const metadata = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata();
    if ((metadata.pages ?? 1) > 1) {
      skipped.push(`${file} (animated/multipage)`);
      continue;
    }
    const swapped = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    const width = (swapped ? metadata.height : metadata.width) ?? 0;
    const height = (swapped ? metadata.width : metadata.height) ?? 0;
    if (!width || !height) throw new Error(`Missing image dimensions: ${file}`);
    const sizes = [
      ...new Set([
        ...widths.filter((size) => size <= width),
        Math.min(width, widths[widths.length - 1]),
      ]),
    ].sort((a, b) => a - b);
    const id = createHash("sha256")
      .update(buffer)
      .update(
        JSON.stringify({
          file,
          sizes,
          quality,
          sharp: sharp.versions.sharp,
          vips: sharp.versions.vips,
        }),
      )
      .digest("hex")
      .slice(0, 20);
    const variants: OptimizedImage["variants"] = [];
    for (const size of sizes) {
      for (const format of ["avif", "webp"] as const) {
        const result = await sharp(buffer, { limitInputPixels: 100_000_000 })
          .rotate()
          .resize({ width: size, withoutEnlargement: true })
          [format]({ quality, effort: 4 })
          .toBuffer({ resolveWithObject: true });
        const name = `${id}-${result.info.width}.${format}`;
        await atomicWrite(path.join(output, name), result.data);
        variants.push({
          src: `${prefix}/${name}`,
          width: result.info.width,
          height: result.info.height,
          bytes: result.info.size,
          format,
        });
      }
    }
    const fallbackSize = sizes.find((size) => size >= 1280) ?? sizes[sizes.length - 1];
    const format = metadata.hasAlpha ? "png" : "jpeg";
    const fallback = await sharp(buffer, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: fallbackSize, withoutEnlargement: true })
      [format]({ quality })
      .toBuffer({ resolveWithObject: true });
    const name = `${id}-fallback.${format === "jpeg" ? "jpg" : "png"}`;
    await atomicWrite(path.join(output, name), fallback.data);
    images[file] = {
      src: `${prefix}/${name}`,
      width: fallback.info.width,
      height: fallback.info.height,
      sources: ["avif", "webp"].map((type) => ({
        type: `image/${type}`,
        srcSet: variants
          .filter((item) => item.format === type)
          .map((item) => `${item.src} ${item.width}w`)
          .join(", "),
      })),
      variants,
    };
    log(`Optimized ${file}: ${sizes.join(", ")}px, AVIF + WebP`);
  }
  if (!Object.keys(images).length)
    throw new Error(`No still images optimized. Skipped: ${skipped.join(", ")}`);
  await atomicWrite(
    path.join(output, "manifest.json"),
    JSON.stringify({ images, skipped }, null, 2),
  );
  await atomicWrite(
    path.join(root, "src/assets/images.generated.ts"),
    `// Asset manifest; regenerate with mozole assets.\nexport const images = ${JSON.stringify(images, null, 2)} as const;\n`,
  );
  const component = "src/components/ui/ResponsiveImage.tsx";
  const newComponent = !(await exists(path.join(root, component)));
  await writeFiles(root, {
    [component]: `import type { ImgHTMLAttributes } from "react";

export interface ResponsiveImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "width" | "height" | "loading" | "fetchPriority" | "alt" | "sizes"> {
  image: { src: string; width: number; height: number; sources: readonly { type: string; srcSet: string }[] };
  alt: string;
  sizes: string;
  priority?: boolean;
}

export function ResponsiveImage({ image, alt, sizes, priority = false, ...props }: ResponsiveImageProps) {
  return <picture>
    {image.sources.map(source => <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={sizes} />)}
    <img {...props} src={image.src} width={image.width} height={image.height} alt={alt} sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />
  </picture>;
}
`,
  });
  if (newComponent) {
    for (const [file, line] of [
      ["src/components/ui/index.ts", 'export * from "./ResponsiveImage";'],
      ["src/library/index.ts", 'export * from "../components/ui";'],
    ]) {
      const target = path.join(root, file);
      const content = (await exists(target)) ? await readFile(target, "utf8") : "";
      if (!content.includes(line)) await atomicWrite(target, `${content}\n${line}\n`);
    }
  }
  await scaffoldToolsGuide(root);
  try {
    await run(
      "npx",
      [
        "@biomejs/biome",
        "format",
        "--write",
        "src/assets",
        "src/components/ui/ResponsiveImage.tsx",
      ],
      { cwd: root },
    );
  } catch {
    // Non-fatal if biome is not yet available in the environment
  }
  log(
    `Wrote ${Object.keys(images).length} images to ${output}; skipped: ${skipped.join(", ") || "none"}. Originals preserved.`,
  );
  return images;
}
