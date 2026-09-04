/**
 * One courtesy reply per user per window. Entries are kept in insertion order
 * so expired ones are dropped from the front; past MAX_ENTRIES the oldest live
 * entry is evicted.
 */
export class NoticeCooldown {
  private static readonly MAX_ENTRIES = 10_000
  private readonly lastNoticeAt = new Map<number, number>()

  constructor(private readonly windowMs: number) {}

  shouldNotify(userId: number, now: number = Date.now()): boolean {
    const last = this.lastNoticeAt.get(userId)
    if (last !== undefined) {
      if (now - last < this.windowMs) return false
      this.lastNoticeAt.delete(userId)
    }

    this.evict(now)
    this.lastNoticeAt.set(userId, now)
    return true
  }

  private evict(now: number): void {
    for (const [userId, at] of this.lastNoticeAt) {
      if (now - at < this.windowMs) break
      this.lastNoticeAt.delete(userId)
    }
    if (this.lastNoticeAt.size >= NoticeCooldown.MAX_ENTRIES) {
      const oldest = this.lastNoticeAt.keys().next().value
      if (oldest !== undefined) this.lastNoticeAt.delete(oldest)
    }
  }
}
