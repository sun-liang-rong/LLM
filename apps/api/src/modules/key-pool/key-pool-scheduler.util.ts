export interface WeightedKey {
  id: string;
  weight: number;
}

export function expandKeysByWeight<T extends WeightedKey>(keys: T[]): T[] {
  return keys.flatMap((key) => {
    const weight = Math.max(Math.trunc(key.weight), 1);
    return Array.from({ length: weight }, () => key);
  });
}

export function orderedWeightedCandidates<T extends WeightedKey>(
  keys: T[],
  cursor: number,
) {
  const weighted = expandKeysByWeight(keys);
  if (weighted.length === 0) {
    return { ordered: [] as T[], nextCursor: cursor };
  }

  const offset = cursor % weighted.length;
  const seen = new Set<string>();
  const rotated = [...weighted.slice(offset), ...weighted.slice(0, offset)];

  return {
    ordered: rotated.filter((key) => {
      if (seen.has(key.id)) {
        return false;
      }
      seen.add(key.id);
      return true;
    }),
    nextCursor: cursor + 1,
  };
}
