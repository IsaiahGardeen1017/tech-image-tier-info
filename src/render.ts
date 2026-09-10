import { PNG } from "pngjs";
import type { Config } from "./types.js";

export interface RenderResult {
  png: Buffer;
  compressedBars: boolean;
}

interface Rgba { r: number; g: number; b: number; a: number }

function parseColor(value: string): Rgba {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) throw new Error(`Invalid color '${value}'; expected #RRGGBB or #RRGGBBAA`);
  const rgb = match[1]!;
  return {
    r: Number.parseInt(rgb.slice(0, 2), 16),
    g: Number.parseInt(rgb.slice(2, 4), 16),
    b: Number.parseInt(rgb.slice(4, 6), 16),
    a: match[2] ? Number.parseInt(match[2], 16) : 255,
  };
}

function fill(png: PNG, x: number, y: number, width: number, height: number, color: Rgba): void {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(png.width, Math.ceil(x + width));
  const bottom = Math.min(png.height, Math.ceil(y + height));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const offset = (py * png.width + px) * 4;
      png.data[offset] = color.r;
      png.data[offset + 1] = color.g;
      png.data[offset + 2] = color.b;
      png.data[offset + 3] = color.a;
    }
  }
}

export function decorateIcon(
  sourcePng: Buffer,
  borderTiers: number[],
  successorTiers: number[],
  importantPathColors: string[],
  config: Config,
): RenderResult {
  const png = PNG.sync.read(sourcePng);
  const border = Math.max(1, Math.min(Math.floor(config.border.thickness), Math.floor(Math.min(png.width, png.height) / 2)));
  const tiers = [...new Set(borderTiers)].sort((a, b) => a - b);
  if (tiers.length === 0) throw new Error("Cannot render an icon without a tier");

  for (let x = 0; x < png.width; x += 1) {
    const tierIndex = Math.min(tiers.length - 1, Math.floor((x * tiers.length) / png.width));
    const color = parseColor(config.colors[String(tiers[tierIndex]!)]!);
    fill(png, x, 0, 1, border, color);
    fill(png, x, png.height - border, 1, border, color);
  }
  fill(png, 0, border, border, png.height - border * 2, parseColor(config.colors[String(tiers[0]!)]!));
  fill(png, png.width - border, border, border, png.height - border * 2, parseColor(config.colors[String(tiers.at(-1)!)]!));

  let thickness = Math.max(1, Math.floor(config.bars.thickness));
  let gap = Math.max(0, Math.floor(config.bars.gapThickness));
  const rightInset = Math.max(0, Math.floor(config.bars.rightInset));
  const startY = Math.max(0, Math.floor(config.bars.startY));
  const rightEdge = Math.max(0, png.width - rightInset);
  const available = rightEdge;
  const requestedWidth = successorTiers.length === 0 ? 0 : successorTiers.length * thickness + (successorTiers.length - 1) * gap;
  let compressedBars = requestedWidth > available;
  if (compressedBars && successorTiers.length > 0) {
    thickness = Math.floor((available - Math.max(0, successorTiers.length - 1) * gap) / successorTiers.length);
    if (thickness < 1) {
      thickness = 1;
      gap = successorTiers.length > 1
        ? Math.max(0, Math.floor((available - successorTiers.length) / (successorTiers.length - 1)))
        : 0;
    }
  }

  const barsWidth = successorTiers.length === 0 ? 0 : successorTiers.length * thickness + (successorTiers.length - 1) * gap;
  if (barsWidth > 0) {
    const padding = Math.max(0, Math.floor(config.bars.backgroundPadding));
    fill(
      png,
      rightEdge - barsWidth - padding,
      startY,
      barsWidth + padding * 2,
      Math.max(1, Math.floor(config.bars.height)) + padding,
      parseColor(config.bars.backgroundColor),
    );
    successorTiers.forEach((tier, index) => {
      fill(
        png,
        rightEdge - thickness - index * (thickness + gap),
        startY,
        thickness,
        Math.max(1, Math.floor(config.bars.height)),
        parseColor(config.colors[String(tier)]!),
      );
    });
  }

  if (importantPathColors.length > 0) {
    const dotSize = Math.max(1, Math.floor(config.importantTechDots.size));
    const dotBorder = Math.max(0, Math.floor(config.importantTechDots.borderThickness));
    const dotGap = Math.max(0, Math.floor(config.importantTechDots.gapThickness));
    const outerSize = dotSize + dotBorder * 2;
    const totalWidth = importantPathColors.length * outerSize + (importantPathColors.length - 1) * dotGap;
    if (totalWidth > png.width) throw new Error(`${importantPathColors.length} important-tech dots require ${totalWidth}px but the icon is only ${png.width}px wide`);
    const startX = Math.floor((png.width - totalWidth) / 2);
    const y = png.height - Math.floor(config.importantTechDots.bottomInset) - outerSize;
    if (y < 0) throw new Error("importantTechDots.bottomInset places dots outside the icon");
    importantPathColors.forEach((color, index) => {
      const x = startX + index * (outerSize + dotGap);
      fill(png, x, y, outerSize, outerSize, parseColor(config.bars.backgroundColor));
      fill(png, x + dotBorder, y + dotBorder, dotSize, dotSize, parseColor(color));
    });
  }

  return { png: PNG.sync.write(png), compressedBars };
}
