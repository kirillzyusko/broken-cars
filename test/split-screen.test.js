import assert from "node:assert/strict";
import test from "node:test";
import { cellPixelRect, splitScreenCells, splitScreenGrid, splitScreenViews } from "../src/split-screen.js";

test("one racer fills the screen, two share it side by side, three and four use a 2×2 grid", () => {
  assert.deepEqual(splitScreenGrid(0), { columns: 1, rows: 1 });
  assert.deepEqual(splitScreenGrid(1), { columns: 1, rows: 1 });
  assert.deepEqual(splitScreenGrid(2), { columns: 2, rows: 1 });
  assert.deepEqual(splitScreenGrid(3), { columns: 2, rows: 2 });
  assert.deepEqual(splitScreenGrid(4), { columns: 2, rows: 2 });
  assert.deepEqual(splitScreenGrid(6), { columns: 3, rows: 2 });
});

test("cells are listed in reading order and tile the whole screen without gaps or overlaps", () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const cells = splitScreenCells(count);
    assert.ok(cells.length >= count);
    assert.deepEqual(cells[0], { x: 0, y: 0, w: cells[0].w, h: cells[0].h });
    for (const [width, height] of [[1920, 970], [1919, 969], [375, 667]]) {
      const rects = cells.map((cell) => cellPixelRect(cell, width, height));
      const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
      assert.equal(area, width * height, `${count} feeds at ${width}×${height}`);
      for (const rect of rects) {
        assert.ok(rect.x >= 0 && rect.y >= 0);
        assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          assert.ok(!overlaps, `cells ${i} and ${j} overlap for ${count} feeds`);
        }
      }
    }
  }
});

test("the top-left cell sits at the top in PlayCanvas' bottom-left viewport coordinates", () => {
  const [topLeft, topRight, bottomLeft] = splitScreenCells(4).map((cell) => cellPixelRect(cell, 1920, 970));
  assert.equal(topLeft.x, 0);
  assert.equal(topLeft.y + topLeft.height, 970);
  assert.equal(topRight.x, 960);
  assert.equal(bottomLeft.y, 0);
});

test("feeds keep seat order and a spare cell becomes the island overview", () => {
  const feeds = [{ playerId: "a" }, { playerId: "b" }, { playerId: "c" }];
  const views = splitScreenViews(feeds);
  assert.equal(views.length, 4);
  assert.deepEqual(views.map((view) => view.playerId), ["a", "b", "c", null]);
  assert.deepEqual(views.map((view) => view.mode), ["driver", "driver", "driver", "overview"]);
  assert.equal(new Set(views.map((view) => view.key)).size, 4);
  assert.deepEqual(splitScreenViews([{ key: "seat-1", playerId: "x" }])[0], { x: 0, y: 0, w: 1, h: 1, key: "seat-1", playerId: "x", mode: "driver" });
  assert.equal(splitScreenViews([]).length, 1);
  assert.equal(splitScreenViews([])[0].mode, "overview");
});
