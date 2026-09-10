import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { decorateIcon } from "../src/render.js";
import type { Config } from "../src/types.js";

test("places successor bars from the top-right toward the left", () => {
  const source = new PNG({ width: 8, height: 8 });
  const config: Config = {
    gamePath: "C:/game",
    imageMagickCommand: "magick",
    workshop: { modVersion: "1.0.0", remoteFileId: "" },
    colors: { "0": "#808080", "1": "#00FF00", "2": "#0000FF" },
    importantTechnologies: {},
    importantTechDots: { size: 3, borderThickness: 1, gapThickness: 1, bottomInset: 2 },
    border: { thickness: 1 },
    bars: {
      thickness: 1,
      height: 3,
      gapThickness: 1,
      rightInset: 0,
      startY: 0,
      backgroundColor: "#FFFFFF",
      backgroundPadding: 0,
    },
  };
  const result = PNG.sync.read(decorateIcon(PNG.sync.write(source), [0], [1, 2], [], config).png);
  const pixel = (x: number, y: number) => [...result.data.subarray((y * result.width + x) * 4, (y * result.width + x) * 4 + 4)];
  assert.deepEqual(pixel(7, 1), [0, 255, 0, 255]);
  assert.deepEqual(pixel(6, 1), [255, 255, 255, 255]);
  assert.deepEqual(pixel(5, 1), [0, 0, 255, 255]);
});

test("draws a centered 3x3 important-tech dot with a background-colored surround", () => {
  const source = new PNG({ width: 9, height: 9 });
  const config: Config = {
    gamePath: "C:/game",
    imageMagickCommand: "magick",
    workshop: { modVersion: "1.0.0", remoteFileId: "" },
    colors: { "0": "#808080" },
    importantTechnologies: { tech_goal: "#FFFF00" },
    importantTechDots: { size: 3, borderThickness: 1, gapThickness: 1, bottomInset: 1 },
    border: { thickness: 1 },
    bars: {
      thickness: 1,
      height: 2,
      gapThickness: 1,
      rightInset: 0,
      startY: 0,
      backgroundColor: "#040404",
      backgroundPadding: 1,
    },
  };
  const result = PNG.sync.read(decorateIcon(PNG.sync.write(source), [0], [], ["#FFFF00"], config).png);
  const pixel = (x: number, y: number) => [...result.data.subarray((y * result.width + x) * 4, (y * result.width + x) * 4 + 4)];
  assert.deepEqual(pixel(2, 3), [4, 4, 4, 255]);
  assert.deepEqual(pixel(3, 4), [255, 255, 0, 255]);
  assert.deepEqual(pixel(5, 6), [255, 255, 0, 255]);
});
