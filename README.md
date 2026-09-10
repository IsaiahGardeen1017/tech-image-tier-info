# Tech Image Tier Info

Tech Image Tier Info is a texture-only Stellaris mod generator. It reads the installed game's technology definitions and decorates each 52×52 technology icon with:

- A border colored by the technology's tier.
- A thin colored bar for every technology that directly lists it as a prerequisite.
- Split border colors when multiple technologies with different tiers share one icon.

A successor bar means “leads toward this technology.” A successor with several prerequisites will not necessarily enter the research pool immediately after only one prerequisite is researched.

## Requirements

- Node.js 20 or newer.
- npm.
- ImageMagick 7 with DDS support and the `magick` command available on `PATH`.
- A local Stellaris installation.

The project and commands work from Bash, including Git Bash on Windows. Paths in `config.json` use forward slashes.

## Setup

From this directory:

```bash
npm install
```

Check `gamePath` in `config.json`. It currently points to this computer's detected Steam installation:

```text
F:/SteamLibrary/steamapps/common/Stellaris
```

## Build the mod

```bash
npm run build-mod
```

For quick visual iteration, regenerate only the selected PNG samples:

```bash
npm run build-samples
```

This fast path still reads the current technology definitions so borders and successor bars remain accurate, but converts only the seven selected icons. It does not rebuild DDS files, replace the rest of the mod, update the descriptor or report, or create a ZIP backup.

To use a different configuration file:

```bash
npm run build-mod -- /absolute/path/to/config.json
```

The sample-only command accepts the same optional configuration path:

```bash
npm run build-samples -- /absolute/path/to/config.json
```

Run the same command again after Stellaris updates. Each build recreates the generated DDS and sample directories, rebuilds the technology graph, writes a fresh report, and updates `supported_version` in both descriptors from the installed game version. Compatibility keeps the detected major and minor numbers and wildcards the patch number—for example, installed `v4.4.6` produces `v4.4.*`—then creates a versioned ZIP backup.

Generated files are separated from the generator source. The `mod` directory mirrors the contents of Stellaris's actual user `mod` directory, so copy both entries inside it together:

```text
mod/tech_image_tier_info.mod                        Launcher registration file
mod/tech_image_tier_info/                           Complete generated mod
mod/tech_image_tier_info/descriptor.mod             Stellaris mod descriptor
mod/tech_image_tier_info/thumbnail.png              Launcher/Workshop thumbnail
mod/tech_image_tier_info/gfx/.../*.dds              Finished mod textures
mod/tech_image_tier_info/samples/*.png              Selected sample icons
mod/tech_image_tier_info/build-report.txt           Warnings and build summary
mod/tech_image_tier_info/workshop-description.txt   Text to paste into the Workshop description
mod/tech_image_tier_info/workshop-change-notes.txt  Text to paste into the Workshop change notes
mod/tech_image_tier_info/workshop-assets/*.png      Images prepared for manual Workshop upload
generated/tech-tree.json                            Generator working data
backups/tech-image-tier-info-v*.zip                 Generated-mod backups
```

Backup names contain both the detected Stellaris version and a UTC build timestamp, for example `tech-image-tier-info-v4.4.6-20260910T193000Z.zip`. This preserves every completed build instead of replacing the previous backup. Each archive contains both drag-and-drop local mod entries; generator source, dependencies, configuration, working data, and older backups are excluded.

The report lists shared icons, missing icons, unresolved tiers, unknown prerequisites, compressed bars, and conversion failures. Technologies with multiple prerequisites are normal and are retained in the JSON graph without generating warnings. Fatal failures and generated-icon errors make the npm command exit nonzero.

## Configuration

All visual settings live in `config.json`.

- `colors`: Dictionary mapping each numeric technology tier to a hex color. Add a tier here if a future Stellaris update introduces one.
- `workshop.modVersion`: Release version displayed by the launcher and Workshop metadata.
- `workshop.remoteFileId`: Leave blank for the first upload. After Steam creates the item, put its numeric Workshop ID here so future builds retain the update association.
- `importantTechnologies`: Dictionary mapping important destination technology IDs to their bottom-dot colors. Every prerequisite on any valid path to a configured destination receives that destination's dot.
- `importantTechDots.size`: Width and height of each colored dot in pixels; the default is 3×3.
- `importantTechDots.borderThickness`: Thickness of the surrounding `bars.backgroundColor` box.
- `importantTechDots.gapThickness`: Space between multiple bottom dots.
- `importantTechDots.bottomInset`: Distance between the bottom of the icon and the outside of the dot boxes.
- `border.thickness`: Border width in pixels.
- `bars.thickness`: Preferred width of each successor bar in pixels.
- `bars.height`: Bar height in pixels.
- `bars.gapThickness`: Space between bars in pixels.
- `bars.rightInset`: Distance from the icon's right edge to the first bar.
- `bars.startY`: Distance from the icon's top edge to the bars.
- `bars.backgroundColor`: Color behind the bar group.
- `bars.backgroundPadding`: Padding around the bar group.
- `imageMagickCommand`: ImageMagick executable name or absolute path.

The PNG sample list is source-controlled in `src/sample-technologies.ts`. It currently contains Antimatter Missiles, Colonial Centralization, Hyper Relays, Administrative AI, Battleships, Mega-Engineering, and Standardized Corvette Patterns.

If all configured bars cannot fit across a 52-pixel icon, the generator reduces their width and gap so every direct successor remains represented, then records `BARS_COMPRESSED` in the report.

## Install in the Stellaris launcher

The launcher expects local mods below its user data directory, normally:

```text
Documents/Paradox Interactive/Stellaris/mod
```

Copy both `mod/tech_image_tier_info.mod` and `mod/tech_image_tier_info` into the launcher mod directory. You can select both entries and drag them together. Register/enable the local mod in the Paradox launcher. The generated content only replaces graphical DDS files; it does not replace technology definitions or gameplay scripts.

For a Workshop release, upload `mod/tech_image_tier_info` through the Paradox launcher. It contains the generated 512×512 `thumbnail.png`, publishing text, and prepared images under `workshop-assets`. Edit their source templates under `src/templates`, not generated output, because every full build replaces the package.

Steam does not automatically turn PNG files bundled with a mod into screenshots on its Workshop page. After the launcher creates or updates the Workshop item, open that item's Steam Workshop page and upload the files from `workshop-assets` and any desired files from `samples` manually. Likewise, copy the generated description and change notes into Steam's corresponding publishing fields when needed.

## Development checks

```bash
npm test
npm run build
```
