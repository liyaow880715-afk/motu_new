export const IMAGE_GENERATION_CONCURRENCY = 16;
export const CAMPAIGN_GENERATION_WAVE_SIZE = 3;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}
