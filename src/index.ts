import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import archiver from "archiver";
import { parseClausewitz, firstEntry, scalar, type BlockValue } from "./parser.js";
import { BuildReport } from "./report.js";
import { decorateIcon } from "./render.js";
import { SAMPLE_TECHNOLOGIES } from "./sample-technologies.js";
import type { Config, Technology, TechTree } from "./types.js";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..");
const templateRoot = path.join(projectRoot, "src", "templates");
const localPackageRoot = path.join(projectRoot, "mod");
const modId = "tech_image_tier_info";
const packageName = "tech-image-tier-info";
const finalModRoot = path.join(localPackageRoot, modId);
const report = new BuildReport();

async function walk(directory: string, extension: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(fullPath, extension));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) results.push(fullPath);
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function requireNumber(value: number, name: string, minimum: number): void {
  if (!Number.isFinite(value) || value < minimum) throw new Error(`${name} must be at least ${minimum}`);
}

function validateConfig(config: Config): void {
  if (!path.isAbsolute(config.gamePath)) throw new Error("config.gamePath must be an absolute path");
  if (!config.workshop.modVersion.trim() || config.workshop.modVersion.includes('"')) throw new Error("workshop.modVersion must be a non-empty value without quotes");
  if (config.workshop.remoteFileId && !/^\d+$/.test(config.workshop.remoteFileId)) throw new Error("workshop.remoteFileId must be blank or contain only the numeric Steam Workshop ID");
  requireNumber(config.border.thickness, "border.thickness", 1);
  requireNumber(config.bars.thickness, "bars.thickness", 1);
  requireNumber(config.bars.height, "bars.height", 1);
  requireNumber(config.bars.gapThickness, "bars.gapThickness", 0);
  requireNumber(config.bars.rightInset, "bars.rightInset", 0);
  requireNumber(config.bars.startY, "bars.startY", 0);
  requireNumber(config.bars.backgroundPadding, "bars.backgroundPadding", 0);
  requireNumber(config.importantTechDots.size, "importantTechDots.size", 1);
  requireNumber(config.importantTechDots.borderThickness, "importantTechDots.borderThickness", 0);
  requireNumber(config.importantTechDots.gapThickness, "importantTechDots.gapThickness", 0);
  requireNumber(config.importantTechDots.bottomInset, "importantTechDots.bottomInset", 0);
  for (const [tier, color] of Object.entries(config.colors)) {
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) throw new Error(`colors.${tier} is not a valid hex color`);
  }
  for (const [technology, color] of Object.entries(config.importantTechnologies)) {
    if (!technology.startsWith("tech_")) throw new Error(`importantTechnologies key '${technology}' is not a technology ID`);
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) throw new Error(`importantTechnologies.${technology} is not a valid hex color`);
  }
}

function collectTechnologyReferences(block: BlockValue): string[] {
  const references = block.values.filter((value) => value.startsWith("tech_"));
  for (const entry of block.entries) {
    if (entry.key.startsWith("tech_")) references.push(entry.key);
    if (entry.value.kind === "scalar") {
      if (entry.value.value.startsWith("tech_")) references.push(entry.value.value);
    } else {
      references.push(...collectTechnologyReferences(entry.value));
    }
  }
  return [...new Set(references)];
}

function buildImportantPathColors(tree: TechTree, config: Config): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  for (const [targetId, color] of Object.entries(config.importantTechnologies)) {
    if (!tree.technologies[targetId]) {
      report.error("IMPORTANT_TECH_NOT_FOUND", `Configured important technology ${targetId} was not parsed`);
      continue;
    }
    const visited = new Set<string>();
    const visit = (technologyId: string): void => {
      if (visited.has(technologyId)) return;
      visited.add(technologyId);
      const technology = tree.technologies[technologyId];
      if (!technology) return;
      const colors = paths.get(technologyId) ?? [];
      if (!colors.includes(color)) colors.push(color);
      paths.set(technologyId, colors);
      for (const prerequisite of technology.prerequisites) visit(prerequisite);
    };
    visit(targetId);
  }
  return paths;
}

function resolveTier(raw: string | undefined, variables: Map<string, string>): { tier?: number; source: string } {
  if (raw === undefined) return { source: "missing" };
  let value = raw;
  const visited = new Set<string>();
  while (value.startsWith("@") && variables.has(value) && !visited.has(value)) {
    visited.add(value);
    value = variables.get(value)!;
  }
  const tier = Number(value);
  return Number.isInteger(tier) ? { tier, source: raw } : { source: raw };
}

function toSupportedVersion(gameVersion: string): string {
  const match = gameVersion.match(/^v?(\d+)\.(\d+)(?:\.\d+)?/);
  if (!match) return gameVersion.startsWith("v") ? gameVersion : `v${gameVersion}`;
  return `v${match[1]}.${match[2]}.*`;
}

interface ParsedFile { file: string; root: BlockValue }

async function parseFiles(files: string[]): Promise<ParsedFile[]> {
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    try {
      parsed.push({ file, root: parseClausewitz(await readFile(file, "utf8")) });
    } catch (error) {
      report.error("PARSE_ERROR", `Could not parse ${file}`, [String(error)]);
    }
  }
  return parsed;
}

function collectVariables(parsedFiles: ParsedFile[]): Map<string, string> {
  const variables = new Map<string, string>();
  for (const { file, root } of parsedFiles) {
    for (const entry of root.entries) {
      const value = scalar(entry);
      if (!entry.key.startsWith("@") || value === undefined) continue;
      const previous = variables.get(entry.key);
      if (previous !== undefined && previous !== value) {
        report.warn("VARIABLE_REDEFINED", `${entry.key} changes from ${previous} to ${value}`, [file, `line ${entry.line}`]);
      }
      variables.set(entry.key, value);
    }
  }
  return variables;
}

function normalizeIcon(value: string): string {
  return path.basename(value.replace(/\\/g, "/"), path.extname(value)).toLowerCase();
}

async function buildTree(gamePath: string, gameVersion: string): Promise<TechTree> {
  const technologyPath = path.join(gamePath, "common", "technology");
  const variablePath = path.join(gamePath, "common", "scripted_variables");
  const technologyFiles = await walk(technologyPath, ".txt");
  let variableFiles: string[] = [];
  try { variableFiles = await walk(variablePath, ".txt"); } catch { /* Some versions have no separate directory. */ }
  const parsedTech = await parseFiles(technologyFiles);
  const parsedVariables = await parseFiles(variableFiles);
  const variables = collectVariables([...parsedVariables, ...parsedTech]);
  const technologies = new Map<string, Technology>();

  for (const { file, root } of parsedTech) {
    for (const entry of root.entries) {
      if (!entry.key.startsWith("tech_") || entry.value.kind !== "block") continue;
      const block = entry.value;
      const tierValue = resolveTier(scalar(firstEntry(block, "tier")), variables);
      if (tierValue.tier === undefined) {
        report.error("UNRESOLVED_TIER", `${entry.key} has unresolved tier '${tierValue.source}'`, [file, `line ${entry.line}`]);
        continue;
      }
      const prerequisitesEntry = firstEntry(block, "prerequisites");
      const prerequisites = prerequisitesEntry?.value.kind === "block"
        ? collectTechnologyReferences(prerequisitesEntry.value)
        : [];
      const explicitIcon = scalar(firstEntry(block, "icon"));
      const technology: Technology = {
        id: entry.key,
        tier: tierValue.tier,
        tierSource: tierValue.source,
        icon: normalizeIcon(explicitIcon ?? entry.key),
        prerequisites,
        successors: [],
        sourceFile: path.relative(gamePath, file).replace(/\\/g, "/"),
        sourceLine: entry.line,
      };
      const previous = technologies.get(technology.id);
      if (previous) report.warn("TECHNOLOGY_REDEFINED", `${technology.id} is defined more than once`, [`Earlier: ${previous.sourceFile}:${previous.sourceLine}`, `Using: ${technology.sourceFile}:${technology.sourceLine}`]);
      technologies.set(technology.id, technology);
    }
  }

  for (const technology of technologies.values()) {
    for (const prerequisite of technology.prerequisites) {
      const parent = technologies.get(prerequisite);
      if (parent) parent.successors.push(technology.id);
      else report.warn("UNKNOWN_PREREQUISITE", `${technology.id} references missing prerequisite ${prerequisite}`);
    }
  }
  for (const technology of technologies.values()) technology.successors.sort();

  return {
    gameVersion,
    generatedAt: new Date().toISOString(),
    technologies: Object.fromEntries([...technologies.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

async function convertToPng(command: string, source: string, destination: string): Promise<void> {
  await execFileAsync(command, [source, destination], { windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

async function convertToDds(command: string, source: string, destination: string): Promise<void> {
  await execFileAsync(command, [source, "-define", "dds:compression=none", destination], { windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => values[key] ?? "").replace(/\n{3,}/g, "\n\n");
}

async function writePackageMetadata(packageRoot: string, modRoot: string, config: Config, supportedVersion: string, gameVersion: string): Promise<void> {
  const remoteFileId = config.workshop.remoteFileId.trim();
  const values = {
    MOD_VERSION: config.workshop.modVersion,
    SUPPORTED_VERSION: supportedVersion,
    GAME_VERSION: gameVersion,
    REMOTE_FILE_ID: remoteFileId ? `remote_file_id="${remoteFileId}"` : "",
  };
  const descriptorTemplate = await readFile(path.join(templateRoot, "descriptor.mod.template"), "utf8");
  const launcherTemplate = await readFile(path.join(templateRoot, "launcher.mod.template"), "utf8");
  await Promise.all([
    writeFile(path.join(modRoot, "descriptor.mod"), renderTemplate(descriptorTemplate, values), "utf8"),
    writeFile(path.join(packageRoot, `${modId}.mod`), renderTemplate(launcherTemplate, values), "utf8"),
    cp(path.join(templateRoot, "thumbnail.png"), path.join(modRoot, "thumbnail.png")),
  ]);
}

async function createBackup(gameVersion: string, builtAt: Date): Promise<string> {
  const backupRoot = path.join(projectRoot, "backups");
  await mkdir(backupRoot, { recursive: true });
  const timestamp = builtAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupName = `${packageName}-v${gameVersion}-${timestamp}.zip`;
  const backupPath = path.join(backupRoot, backupName);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(backupPath, { flags: "wx" });
    const zip = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
    zip.pipe(output);
    zip.directory(localPackageRoot, false);
    void zip.finalize();
  });
  return backupPath;
}

async function buildSamplesOnly(
  config: Config,
  tree: TechTree,
  groups: Map<string, Technology[]>,
  iconByName: Map<string, string>,
  importantPathColors: Map<string, string[]>,
): Promise<void> {
  const tempRoot = path.join(projectRoot, ".tmp");
  const workRoot = path.join(tempRoot, "work");
  const stagingSamplesRoot = path.join(tempRoot, "samples");
  await rm(tempRoot, { recursive: true, force: true });
  await Promise.all([mkdir(workRoot, { recursive: true }), mkdir(stagingSamplesRoot, { recursive: true })]);

  const renderedByIcon = new Map<string, Buffer>();
  for (const technologyId of SAMPLE_TECHNOLOGIES) {
    const technology = tree.technologies[technologyId];
    if (!technology) throw new Error(`Sample technology '${technologyId}' was not parsed`);
    const members = groups.get(technology.icon);
    if (!members) throw new Error(`No effective icon group exists for sample '${technologyId}'`);
    const sourceIcon = iconByName.get(technology.icon);
    if (!sourceIcon) throw new Error(`No DDS file was found for sample icon '${technology.icon}'`);

    let decorated = renderedByIcon.get(technology.icon);
    if (!decorated) {
      const successorIds = [...new Set(members.flatMap((member) => member.successors))]
        .filter((id) => tree.technologies[id] !== undefined)
        .sort((a, b) => tree.technologies[a]!.tier - tree.technologies[b]!.tier || a.localeCompare(b));
      const inputPng = path.join(workRoot, `${technology.icon}.source.png`);
      await convertToPng(config.imageMagickCommand, sourceIcon, inputPng);
      decorated = decorateIcon(
        await readFile(inputPng),
        [...new Set(members.map((member) => member.tier))],
        successorIds.map((id) => tree.technologies[id]!.tier),
        [...new Set(members.flatMap((member) => importantPathColors.get(member.id) ?? []))],
        config,
      ).png;
      renderedByIcon.set(technology.icon, decorated);
    }
    await writeFile(path.join(stagingSamplesRoot, `${technologyId}.png`), decorated);
  }

  const finalSamplesRoot = path.join(finalModRoot, "samples");
  await mkdir(finalModRoot, { recursive: true });
  await rm(finalSamplesRoot, { recursive: true, force: true });
  await rename(stagingSamplesRoot, finalSamplesRoot);
  await rm(tempRoot, { recursive: true, force: true });
  console.log(`Generated ${SAMPLE_TECHNOLOGIES.length} sample PNGs.`);
  console.log(`Samples: ${finalSamplesRoot}`);
}

async function main(): Promise<void> {
  const started = new Date();
  const argumentsList = process.argv.slice(2);
  const samplesOnly = argumentsList.includes("--samples-only");
  const configArgument = argumentsList.find((argument) => !argument.startsWith("--"));
  const configPath = path.resolve(configArgument ?? path.join(projectRoot, "config.json"));
  const config = JSON.parse(await readFile(configPath, "utf8")) as Config;
  validateConfig(config);

  const launcherSettingsPath = path.join(config.gamePath, "launcher-settings.json");
  const launcher = JSON.parse(await readFile(launcherSettingsPath, "utf8")) as { rawVersion?: string; modsCompatibilityVersion?: string };
  const gameVersion = launcher.rawVersion?.replace(/^v/, "") ?? "unknown";
  const supportedVersion = toSupportedVersion(gameVersion);
  const tree = await buildTree(config.gamePath, gameVersion);
  const technologies = Object.values(tree.technologies);
  const importantPathColors = buildImportantPathColors(tree, config);

  for (const technology of technologies) {
    if (!config.colors[String(technology.tier)]) {
      report.error("MISSING_TIER_COLOR", `No color is configured for tier ${technology.tier}`, [technology.id]);
    }
  }
  if (report.count("ERROR") > 0) throw new Error("Technology parsing or color validation failed");

  const iconRoot = path.join(config.gamePath, "gfx", "interface", "icons", "technologies");
  const sourceIcons = await walk(iconRoot, ".dds");
  const iconByName = new Map<string, string>();
  for (const icon of sourceIcons) {
    const key = normalizeIcon(icon);
    if (!iconByName.has(key)) iconByName.set(key, icon);
  }

  const groups = new Map<string, Technology[]>();
  for (const technology of technologies) {
    const group = groups.get(technology.icon) ?? [];
    group.push(technology);
    groups.set(technology.icon, group);
  }

  if (samplesOnly) {
    await buildSamplesOnly(config, tree, groups, iconByName, importantPathColors);
    return;
  }

  const tempRoot = path.join(projectRoot, ".tmp");
  const workRoot = path.join(tempRoot, "work");
  const stagingPackageRoot = path.join(tempRoot, "mod");
  const stagingModRoot = path.join(stagingPackageRoot, modId);
  const outputIconRoot = path.join(stagingModRoot, "gfx", "interface", "icons", "technologies");
  const samplesRoot = path.join(stagingModRoot, "samples");
  const generatedRoot = path.join(projectRoot, "generated");
  await rm(tempRoot, { recursive: true, force: true });
  await Promise.all([mkdir(outputIconRoot, { recursive: true }), mkdir(workRoot, { recursive: true }), mkdir(samplesRoot, { recursive: true }), mkdir(generatedRoot, { recursive: true })]);

  let generated = 0;
  const requestedSamples = new Set<string>(SAMPLE_TECHNOLOGIES);
  const writtenSamples = new Set<string>();
  for (const [iconName, members] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (members.length > 1) {
      const tiers = [...new Set(members.map((member) => member.tier))].sort((a, b) => a - b);
      report.warn("SHARED_ICON", `${iconName}.dds is used by ${members.length} technologies`, [
        ...members.map((member) => `${member.id} (tier ${member.tier})`),
        tiers.length === 1 ? "Border treatment: one color because tiers match" : `Border treatment: ${tiers.length} equal color sections`,
      ]);
    }
    const sourceIcon = iconByName.get(iconName);
    if (!sourceIcon) {
      report.error("MISSING_ICON", `No DDS file was found for ${iconName}`, members.map((member) => member.id));
      continue;
    }

    const successorIds = [...new Set(members.flatMap((member) => member.successors))]
      .filter((id) => tree.technologies[id] !== undefined)
      .sort((a, b) => tree.technologies[a]!.tier - tree.technologies[b]!.tier || a.localeCompare(b));
    const borderTiers = [...new Set(members.map((member) => member.tier))];
    const successorTiers = successorIds.map((id) => tree.technologies[id]!.tier);
    const inputPng = path.join(workRoot, `${iconName}.source.png`);
    const decoratedPng = path.join(workRoot, `${iconName}.png`);
    const outputDds = path.join(outputIconRoot, `${iconName}.dds`);
    try {
      await convertToPng(config.imageMagickCommand, sourceIcon, inputPng);
      const rendered = decorateIcon(
        await readFile(inputPng),
        borderTiers,
        successorTiers,
        [...new Set(members.flatMap((member) => importantPathColors.get(member.id) ?? []))],
        config,
      );
      await writeFile(decoratedPng, rendered.png);
      await convertToDds(config.imageMagickCommand, decoratedPng, outputDds);
      if (rendered.compressedBars) report.warn("BARS_COMPRESSED", `${iconName} has ${successorTiers.length} successor bars; their width was reduced to fit`);
      for (const member of members) {
        if (requestedSamples.has(member.id)) {
          await writeFile(path.join(samplesRoot, `${member.id}.png`), rendered.png);
          writtenSamples.add(member.id);
        }
      }
      generated += 1;
    } catch (error) {
      report.error("ICON_BUILD_FAILED", `Failed to generate ${iconName}.dds`, [String(error)]);
    }
  }

  for (const technologyId of requestedSamples) {
    if (!tree.technologies[technologyId]) report.error("SAMPLE_TECH_NOT_FOUND", `Configured sample technology ${technologyId} was not parsed`);
    else if (!writtenSamples.has(technologyId)) report.error("SAMPLE_NOT_WRITTEN", `The PNG sample for ${technologyId} could not be written`);
  }

  await writeFile(path.join(generatedRoot, "tech-tree.json"), `${JSON.stringify(tree, null, 2)}\n`, "utf8");
  await writePackageMetadata(stagingPackageRoot, stagingModRoot, config, supportedVersion, gameVersion);
  report.info("BUILD_SUMMARY", `Generated ${generated} DDS icons from ${technologies.length} technologies`, [
    `Unique effective icons: ${groups.size}`,
    `Selected sample PNGs: ${writtenSamples.size}`,
  ]);

  const backupTimestamp = new Date();
  const expectedBackupName = `${packageName}-v${gameVersion}-${backupTimestamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.zip`;
  report.info("BACKUP", `Created backups/${expectedBackupName}`, ["The archive contains the complete drag-and-drop local mod package"]);
  const reportText = report.render([
    `Built: ${new Date().toISOString()}`,
    `Game path: ${config.gamePath}`,
    `Game version: ${gameVersion}`,
    `Supported version: ${supportedVersion}`,
    `Config: ${configPath}`,
    `Duration: ${((Date.now() - started.getTime()) / 1000).toFixed(1)} seconds`,
  ]);
  await writeFile(path.join(stagingModRoot, "build-report.txt"), reportText, "utf8");
  if (report.count("ERROR") > 0) throw new Error("The staged mod contains build errors; the previous completed mod was preserved");
  const workshopValues = { GAME_VERSION: gameVersion };
  const [descriptionTemplate, changeNotesTemplate] = await Promise.all([
    readFile(path.join(templateRoot, "workshop-description.txt"), "utf8"),
    readFile(path.join(templateRoot, "workshop-change-notes.txt"), "utf8"),
  ]);
  await Promise.all([
    writeFile(path.join(stagingModRoot, "workshop-description.txt"), renderTemplate(descriptionTemplate, workshopValues), "utf8"),
    writeFile(path.join(stagingModRoot, "workshop-change-notes.txt"), renderTemplate(changeNotesTemplate, workshopValues), "utf8"),
    mkdir(path.join(stagingModRoot, "workshop-assets"), { recursive: true }).then(() => Promise.all([
      cp(path.join(templateRoot, "screenshot.png"), path.join(stagingModRoot, "workshop-assets", "screenshot.png")),
      cp(path.join(templateRoot, "teirs.png"), path.join(stagingModRoot, "workshop-assets", "tiers.png")),
    ])),
  ]);
  await Promise.all([rm(localPackageRoot, { recursive: true, force: true }), rm(path.join(projectRoot, "steam-ready"), { recursive: true, force: true })]);
  await rename(stagingPackageRoot, localPackageRoot);
  const backupPath = await createBackup(gameVersion, backupTimestamp);
  await rm(tempRoot, { recursive: true, force: true });
  console.log(`Generated ${generated} icons. Warnings: ${report.count("WARNING")}. Errors: ${report.count("ERROR")}.`);
  console.log(`Local package: ${localPackageRoot}`);
  console.log(`Report: ${path.join(finalModRoot, "build-report.txt")}`);
  console.log(`Backup: ${backupPath}`);
  if (report.count("ERROR") > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  report.error("FATAL", "The build stopped before completion", [String(error)]);
  const text = report.render([`Built: ${new Date().toISOString()}`, "Status: FAILED"]);
  await writeFile(path.join(projectRoot, "last-failed-build-report.txt"), text, "utf8").catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
});
