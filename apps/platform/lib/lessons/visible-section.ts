/**
 * The last section (in document order) whose heading has reached the upper half of the screen;
 * `inicio` if none has. `tops` maps a heading id to its distance from the top of the viewport.
 */
export function lastVisibleSection(
  ids: string[],
  tops: Record<string, number | undefined>,
  viewportHeight: number,
): string {
  let visible = "inicio";
  for (const id of ids) {
    const top = tops[id];
    if (top !== undefined && top <= viewportHeight / 2) visible = id;
  }
  return visible;
}
