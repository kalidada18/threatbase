// UI shows Threatbase as the single intel source — upstream vendor names are
// deliberately not surfaced. The pipeline still keeps per-feed attribution in
// the feed lines (see memory: threatbase-feed-line-format); this is display-only.
export function labelSources(keys: string[]): string[] {
  return keys.length ? ['Threatbase'] : []
}
