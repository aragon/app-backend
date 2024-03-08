import utils from '@helpers/utils'

interface RetryOptions {
  retries: number
  delay: number
}

const defaultOptions: RetryOptions = {
  retries: 3,
  delay: 3000,
}

export const retry = async <T>(
  action: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> => {
  const { retries, delay } = { ...defaultOptions, ...options }
  let attempt = 0

  const execute = async(): Promise<T> => {
    try {
      return await action()
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
