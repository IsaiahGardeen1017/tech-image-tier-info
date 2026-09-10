import assert from "node:assert/strict";
import test from "node:test";
import { firstEntry, list, parseClausewitz, scalar } from "../src/parser.js";

test("parses technology blocks, lists, variables, quotes, and comments", () => {
  const root = parseClausewitz(`
    @tier = 3
    # ignored comment
    tech_example = {
      tier = @tier
      icon = "shared_icon"
      prerequisites = { "tech_one" tech_two }
      nested = { factor = 2 }
    }
  `);
  assert.equal(scalar(firstEntry(root, "@tier")), "3");
  const tech = firstEntry(root, "tech_example")?.value;
  assert.equal(tech?.kind, "block");
  if (!tech || tech.kind !== "block") return;
  assert.equal(scalar(firstEntry(tech, "tier")), "@tier");
  assert.equal(scalar(firstEntry(tech, "icon")), "shared_icon");
  assert.deepEqual(list(firstEntry(tech, "prerequisites")), ["tech_one", "tech_two"]);
});

test("reports malformed braces", () => {
  assert.throws(() => parseClausewitz("tech_bad = { tier = 1"), /Unclosed block/);
});
