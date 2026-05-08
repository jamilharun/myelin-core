export function calculateDelta(before: number, after: number): number {
  return Math.round(((after - before) / before) * 10000) / 100;
}
