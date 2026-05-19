import utils from '@helpers/utils'

interface RetryOptions {
  retries: number
  delay: number
  timeout: number
  // Absolute wall-clock cap (ms since epoch) across all attempts + delays. When set,
  // each attempt's effective timeout is min(timeout, deadline - now), and retries
  // stop once the next delay would push past the deadline.
  deadline?: number
}

const defaultOptions: Pick<RetryOptions, 'retries' | 'delay' | 'timeout'> = {
  retries: 3,
  delay: 3000,
  timeout: 10000,
}

export const retry = async <T>(action: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> => {
  const { retries, delay, timeout, deadline } = { ...defaultOptions, ...options }
  let attempt = 0

  const execute = async (): Promise<T> => {
    const attemptTimeout = deadline != null ? Math.max(0, Math.min(timeout, deadline - Date.now())) : timeout

    let timeoutId: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<T>((_resolve: any, reject: any) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timeout exceeded'))
      }, attemptTimeout)
    })

    try {
      return await Promise.race([action(), timeoutPromise])
    } catch (error) {
      const deadlineReached = deadline != null && Date.now() + delay >= deadline
      if (attempt < retries && !deadlineReached) {
        attempt++
        await utils.wait(delay)
        return await execute()
      } else {
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return await execute()
}
