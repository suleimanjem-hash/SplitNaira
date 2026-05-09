/**
 * Payout history service (#291 — memory leak fix).
 *
 * Root causes of the original memory leak:
 *   1. `loadFromStorage()` was called on **every** query, reading the entire
 *      JSON file and repopulating the Map each time.  Under load this caused
 *      multiple concurrent reads that left stale closure references alive.
 *   2. The `cache` Map had no size bound — it would grow unboundedly as
 *      records accumulated.
 *   3. `node:fs/promises` and `node:path` were dynamically imported on every
 *      write, preventing V8 from collecting the import promise machinery.
 *
 * Fixes applied:
 *   - Load from storage **once** at service creation, then keep warm in
 *     memory.  Subsequent reads are served from the Map without I/O.
 *   - Hard cap: when `MAX_CACHE_SIZE` is reached, the oldest 10 % of
 *     records (by timestamp) are evicted before inserting new ones.
 *   - Static imports at module level so dynamic-import overhead is zero.
 *   - `destroy()` exposed on the returned service to clear the Map and
 *     release memory when the service is no longer needed.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface PayoutRecord {
  id: string;
  roundId: string;
  recipient: string;
  amount: string;
  token: string;
  timestamp: number;
  txHash: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface PayoutHistoryIndex {
  getPayouts(filters?: PayoutFilters): Promise<PayoutRecord[]>;
  getPayoutById(id: string): Promise<PayoutRecord | null>;
  getPayoutsByRound(roundId: string): Promise<PayoutRecord[]>;
  getPayoutsByRecipient(recipient: string): Promise<PayoutRecord[]>;
  searchPayouts(query: string): Promise<PayoutRecord[]>;
  reindex(): Promise<void>;
  backfill(fromRound?: number): Promise<void>;
  /** Release in-memory resources. Call on graceful shutdown. */
  destroy(): void;
}

export interface PayoutFilters {
  startDate?: number;
  endDate?: number;
  recipient?: string;
  status?: 'pending' | 'completed' | 'failed';
  limit?: number;
  offset?: number;
}

export interface PayoutIndexConfig {
  storageFile: string;
  reindexInterval: number;
  /** Maximum number of records kept in memory. Default: 10 000. */
  maxCacheSize: number;
}

/** Fraction of records evicted when the cache is full. */
const EVICTION_FRACTION = 0.1;

export function createPayoutHistoryService(config?: Partial<PayoutIndexConfig>): PayoutHistoryIndex {
  const storageFile = config?.storageFile ?? './data/payout-history.json';
  const maxCacheSize = config?.maxCacheSize ?? 10_000;

  // Single in-memory store — populated once at startup, never re-read per
  // query.  Insertion-ordered Map gives O(1) get/set and lets us iterate in
  // insertion order for eviction.
  const cache = new Map<string, PayoutRecord>();

  // Tracks whether the initial load has completed.
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  function evictOldest(): void {
    if (cache.size < maxCacheSize) return;

    // Sort by timestamp ascending, evict the oldest EVICTION_FRACTION records.
    const sorted = Array.from(cache.values()).sort((a, b) => a.timestamp - b.timestamp);
    const evictCount = Math.max(1, Math.floor(cache.size * EVICTION_FRACTION));
    for (let i = 0; i < evictCount; i++) {
      cache.delete(sorted[i].id);
    }
  }

  function insertRecord(record: PayoutRecord): void {
    evictOldest();
    cache.set(record.id, record);
  }

  async function loadFromStorage(): Promise<void> {
    try {
      const data = await readFile(storageFile, "utf8");
      const records: PayoutRecord[] = JSON.parse(data);
      cache.clear();
      for (const record of records) {
        // Use insertRecord so the eviction guard applies even during load
        insertRecord(record);
      }
    } catch {
      // File absent or malformed — start with empty cache
      cache.clear();
    }
  }

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = loadFromStorage().then(() => {
        initialized = true;
      });
    }
    return initPromise;
  }

  async function saveToStorage(): Promise<void> {
    const records = Array.from(cache.values());
    await mkdir(dirname(storageFile), { recursive: true });
    await writeFile(storageFile, JSON.stringify(records, null, 2), "utf8");
  }

  function applyFilters(records: PayoutRecord[], filters?: PayoutFilters): PayoutRecord[] {
    let results = records;

    if (filters?.startDate !== undefined) {
      results = results.filter(r => r.timestamp >= filters.startDate!);
    }
    if (filters?.endDate !== undefined) {
      results = results.filter(r => r.timestamp <= filters.endDate!);
    }
    if (filters?.recipient) {
      results = results.filter(r => r.recipient === filters.recipient);
    }
    if (filters?.status) {
      results = results.filter(r => r.status === filters.status);
    }

    results = results.sort((a, b) => b.timestamp - a.timestamp);

    if (filters?.offset) {
      results = results.slice(filters.offset);
    }
    if (filters?.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  // Kick off initial load immediately so the first real request is instant.
  void ensureInitialized();

  return {
    async getPayouts(filters) {
      await ensureInitialized();
      return applyFilters(Array.from(cache.values()), filters);
    },

    async getPayoutById(id) {
      await ensureInitialized();
      return cache.get(id) ?? null;
    },

    async getPayoutsByRound(roundId) {
      await ensureInitialized();
      return Array.from(cache.values()).filter(r => r.roundId === roundId);
    },

    async getPayoutsByRecipient(recipient) {
      return this.getPayouts({ recipient });
    },

    async searchPayouts(query) {
      await ensureInitialized();
      const q = query.toLowerCase();
      return Array.from(cache.values()).filter(
        r =>
          r.recipient.toLowerCase().includes(q) ||
          r.txHash.toLowerCase().includes(q) ||
          r.roundId.toLowerCase().includes(q),
      );
    },

    async reindex() {
      // Re-read from disk and repopulate the cache.
      initialized = false;
      initPromise = null;
      await ensureInitialized();
      await saveToStorage();
    },

    async backfill(fromRound) {
      // Placeholder: integrate with Stellar event indexer.
      console.log(`Backfilling from round ${fromRound ?? 0}`);
    },

    destroy() {
      cache.clear();
      initialized = false;
      initPromise = null;
    },
  };
}
