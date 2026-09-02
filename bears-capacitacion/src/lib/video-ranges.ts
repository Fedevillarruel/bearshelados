export type WatchedRange = [number, number];

export function mergeRanges(ranges: WatchedRange[]): WatchedRange[] {
  const sortedRanges = ranges
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .map(([start, end]) => [Math.floor(start), Math.ceil(end)] as WatchedRange)
    .sort(([firstStart], [secondStart]) => firstStart - secondStart);

  return sortedRanges.reduce<WatchedRange[]>((merged, range) => {
    const previous = merged.at(-1);
    if (!previous || range[0] > previous[1] + 1) {
      merged.push(range);
    } else {
      previous[1] = Math.max(previous[1], range[1]);
    }
    return merged;
  }, []);
}

export function watchedSeconds(ranges: WatchedRange[]) {
  return mergeRanges(ranges).reduce((total, [start, end]) => total + end - start, 0);
}