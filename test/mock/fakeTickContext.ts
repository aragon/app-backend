import type { TickContext } from '@src/modules/crawlers/tickContext'

/**
 * Creates a mock TickContext for use in handler tests.
 * Provides stub implementations of getBlockTimestamp, getLogsByTxHash, and getOrFetch.
 */
export const createMockTickContext = (overrides?: { blockTimestamp?: number; txLogs?: any[] }): TickContext =>
  ({
    getBlockTimestamp: async () => overrides?.blockTimestamp ?? 1630425600,
    getLogsByTxHash: async () => overrides?.txLogs ?? [],
    getLogsByBlock: () => [],
    getOrFetch: async (_key: string, fetcher: () => Promise<any>) => fetcher(),
    init: async () => {},
    clear: () => {},
  }) as unknown as TickContext
