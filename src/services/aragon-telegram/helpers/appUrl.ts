import config from '@config'
import { TELEGRAM_RESERVED_APP_CODES } from '@types'

/** Keeps well-formed `<letter>=<http(s) origin>` pairs; anything else is dropped. */
export const parseAppUrls = (entries: string[]): Record<string, string> => {
  const urls: Record<string, string> = {}
  for (const entry of entries) {
    const [rawCode = '', rawUrl = ''] = entry.split('=')
    const code = rawCode.trim()
    const baseUrl = rawUrl.trim().replace(/\/+$/, '')
    if (
      /^[a-z]$/.test(code) &&
      !TELEGRAM_RESERVED_APP_CODES.includes(code) &&
      /^https?:\/\/[^\s/?#@]+$/.test(baseUrl)
    ) {
      urls[code] = baseUrl
    }
  }
  return urls
}

const alternateAppUrls = (): Record<string, string> => parseAppUrls(config.SERVICES.ARAGON_TELEGRAM.APP_URLS)

const originOf = (raw: string): string | null => {
  try {
    return new URL(raw.trim()).origin
  } catch {
    return null
  }
}

/** The code itself when it names a configured alternate app, otherwise undefined (the default app). */
export const knownAppCode = (code?: string): string | undefined =>
  code && Object.prototype.hasOwnProperty.call(alternateAppUrls(), code) ? code : undefined

/** Base URL of the app behind `code`; unknown or absent codes get the default app. */
export const appBaseUrl = (code?: string): string => {
  const known = knownAppCode(code)
  return known ? alternateAppUrls()[known] : config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL
}

/** Code of the alternate app whose origin is exactly the URL's origin; otherwise undefined. */
export const appCodeFromUrl = (raw: string): string | undefined => {
  const origin = originOf(raw)
  if (!origin) return undefined
  return Object.keys(alternateAppUrls()).find(code => originOf(alternateAppUrls()[code]) === origin)
}

/** True when the URL's origin is exactly the default app or a configured alternate app. */
export const isAppUrl = (raw: string): boolean => {
  const origin = originOf(raw)
  return origin !== null && (origin === originOf(config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL) || !!appCodeFromUrl(raw))
}
