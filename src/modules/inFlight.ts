const InFlight = {
  _pending: new Map<string, Promise<unknown>>(),

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const pending = InFlight._pending.get(key)
    if (pending) return pending as Promise<T>
    const promise = Promise.resolve().then(work)
    InFlight._pending.set(key, promise)
    try {
      return await promise
    } finally {
      InFlight._pending.delete(key)
    }
  },
}

export default InFlight
