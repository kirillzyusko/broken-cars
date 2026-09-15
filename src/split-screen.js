/**
 * Split-screen layout for the TV race view: one third-person feed per racer,
 * tiled like a console party racer. Cells are normalized (0–1) with the origin
 * at the top-left and listed in reading order, so the React HUD grid and the
 * renderer share exactly the same tiling.
 */
export function splitScreenGrid(count) {
  const feeds = Math.max(1, count);
  const columns = Math.ceil(Math.sqrt(feeds));
  const rows = Math.ceil(feeds / columns);
  return { columns, rows };
}

export function splitScreenCells(count) {
  const { columns, rows } = splitScreenGrid(count);
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({ x: column / columns, y: row / rows, w: 1 / columns, h: 1 / rows });
    }
  }
  return cells;
}

/**
 * Pairs feeds with cells in seat order. A spare cell (three racers on a 2×2
 * grid) shows the island overview so the screen never has a dead corner.
 */
export function splitScreenViews(feeds) {
  return splitScreenCells(feeds.length).map((cell, index) => {
    const feed = feeds[index];
    return feed
      ? { ...cell, key: feed.key ?? feed.playerId, playerId: feed.playerId, mode: "driver" }
      : { ...cell, key: `island-${index}`, playerId: null, mode: "overview" };
  });
}

/**
 * Device-pixel rectangle with a bottom-left origin, as PlayCanvas viewports
 * expect. Edges are rounded from the same normalized values on both sides, so
 * neighbouring cells meet exactly without a seam or an overlap.
 */
export function cellPixelRect(cell, width, height) {
  const left = Math.round(cell.x * width);
  const right = Math.round((cell.x + cell.w) * width);
  const top = Math.round(cell.y * height);
  const bottom = Math.round((cell.y + cell.h) * height);
  return {
    x: left,
    y: height - bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
