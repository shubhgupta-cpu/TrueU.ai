/** "#a #b, c" → ["#a", "#b", "#c"] (each tag gets its #, repeats are dropped). */
export function parseHashtags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`)),
    ),
  ];
}
