const timings = new Map<string, bigint>();

export function startTimer(label: string): void {
  timings.set(label, process.hrtime.bigint());
}

export function endTimer(label: string): number {
  const start = timings.get(label);
  if (start === undefined) return 0;
  timings.delete(label);
  return Number(process.hrtime.bigint() - start) / 1e6;
}

export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  startTimer(label);
  try {
    return await fn();
  } finally {
    endTimer(label);
  }
}
