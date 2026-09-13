import { writeFiles } from "../utils/fs.js";
import { COMPONENTS } from "./components.js";

export function generateToolsGuide(): string {
  return `# Components, assets and release tools

## Components

Run mozole add --list to inspect the catalog. Run mozole add accordion,select,sheet
for several components, or mozole add all for the suite. Use --path <project> to select
a customer project explicitly. These are project-owned, token-based foundations; adapt
their design to conversation instructions. No shared implementation package is created.

Files go to src/components/ui, exports to its index.ts and src/library/index.ts, and
installation records to .mozole/components.json. Existing component files are preserved
and skipped, including their exports. Review custom files manually rather than replacing
them. New required dependencies are added to package.json; run npm install afterward,
at the prototype root if applicable. The command never installs dependencies itself.

Catalog: ${Object.keys(COMPONENTS).join(", ")}.

Accessibility composition matters: Dialog/Sheet/Drawer need a Title, appropriate Description
(or aria-describedby={undefined}), and a close control. Sheet and Drawer include a visible
Close control; Drawer is a bottom dialog foundation, without drag-to-dismiss. Menus need
named triggers and indicators for checked/radio items. Tooltip needs TooltipProvider.
Toast needs ToastProvider and ToastViewport. Select needs SelectTrigger/SelectValue and
SelectContent/SelectItem. Form controls need visible associated labels. Progress and
button groups need meaningful accessible names; do not rely on color alone.

Example accordion composition:

    <Accordion type="single" collapsible>
      <AccordionItem value="details">
        <AccordionTrigger>Details</AccordionTrigger>
        <AccordionContent>Project content</AccordionContent>
      </AccordionItem>
    </Accordion>

## Image optimization

Put source raster files in assets/images (outside public), then run:

    mozole assets
    mozole assets --input assets/photos --output public/media --quality 78
    mozole assets --widths 320,640,1280,1920,3840 --base /client/

Sharp creates AVIF/WebP width variants up to source resolution, auto-orients EXIF images,
strips metadata by default, and writes a JPEG/PNG fallback. Default widths are
320, 480, 640, 768, 1024, 1280, 1600, 1920, 2560 and 3840 pixels. Small sources are never
upscaled. Animated and multipage images are skipped and reported; SVGs remain vectors and
are not converted. Source files are preserved. Output is confined to a public subdirectory.
Content-addressed output filenames preserve old variants, so existing page references are
not deleted. manifest.json and src/assets/images.generated.ts describe the latest batch;
one invocation should include all source images needed by the project. Older unused files
can be removed deliberately after confirming they are no longer referenced.

ResponsiveImage.tsx is created only if absent; existing custom implementations are kept.
Import images from src/assets/images.generated and ResponsiveImage from the local UI barrel.
Pass a truthful sizes value for the actual layout. Mark only an above-the-fold critical
image priority; other images lazy-load. Width and height reserve the image's aspect ratio.

    <ResponsiveImage image={images["hero.jpg"]} alt="Restaurant terrace"
      sizes="(max-width: 768px) 100vw, 50vw" priority className="h-auto w-full" />

Set --base to match the deployment path and rebuild the site after regenerating assets.
The command encodes files only; it does not capture or inspect screenshots.

## Production packaging

    mozole release
    mozole release --format zip --output releases/client-v1
    mozole release --format directory --output releases/client-v1
    mozole release --skip-build --from build/client

Default behavior runs npm run build, then writes release/ and release.zip. --skip-build
packages existing output without establishing freshness. Standard React Router static
output defaults to build/client; Flagship defaults to dist. Use --from after customizing
your build directory. index.html is required. This command is not a test runner.

Static assets and the dependency-free PHP api/ module are assembled at the document root.
Node APIs require a separate deployment and are rejected by this packaging target.
Existing outputs are never overwritten; choose a new --output for each release. A file
manifest with SHA-256 hashes and DEPLOYMENT.txt accompany the package. Runtime data, .env,
keys, source maps, databases, logs and development directories are excluded. Review the
omission list. api/config.php is intentionally included as runtime configuration; set its
customer-specific values and server mail transport before deployment.

Apache rewrite/deny rules are included. Existing root .htaccess is preserved; review its
routing if customized. Nginx does not read .htaccess: apply equivalent PHP routing and
configuration-file access restrictions on the server. Configure mail and HTTPS on hosting.
The tool does not log into FTP, run rsync or upload anything; upload the directory contents
through your authorized deployment process. Packages are capped at 512 MiB input size.

## TUI

Open mozole ui and select [6] TOOLS. Choose Add components, Optimize images, or Create
release. Enter configuration with Tab/arrow navigation, Ctrl+U to clear, Enter to run,
and Escape to return. Actions use the currently selected project and report results in
both the panel and cockpit log. Component addition preserves custom code; image encoding
preserves originals; release builds unless Skip build is yes and never uploads.

Headless equivalents:

    mozole ui --action component-add --component accordion,sheet
    mozole ui --action assets-optimize --input assets/images
    mozole ui --action release --format zip --output releases/v1

## Implementation references

- Radix primitives: https://www.radix-ui.com/primitives/docs/overview/introduction
- Sharp encoders: https://sharp.pixelplumbing.com/api-output/
- Sharp resize: https://sharp.pixelplumbing.com/api-resize/
`;
}

export async function scaffoldToolsGuide(root: string): Promise<void> {
  await writeFiles(root, { "docs/tools.md": generateToolsGuide() });
}
