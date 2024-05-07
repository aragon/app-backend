import utils from '@helpers/utils'

interface RetryOptions {
  retries: number
  delay: number
  timeout: number
}

const defaultOptions: RetryOptions = {
  retries: 3,
  delay: 3000,
  timeout: 10000,
}

export const retry = async <T>(action: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> => {
  const { retries, delay, timeout } = { ...defaultOptions, ...options }
  let attempt = 0

  const execute = async (): Promise<T> => {
    const timeoutPromise = new Promise<T>((_resolve: any, reject: any) => {
      setTimeout(() => {
        reject(new Error('Request timeout exceeded'))
      }, timeout)
    })

    try {
      return await Promise.race([action(), timeoutPromise])
    } catch (error) {
      if (attempt < retries) {
        attempt++
        await utils.wait(delay)
        return await execute()
      } else {
        throw error
      }
    }
  }

  return await execute()
}
