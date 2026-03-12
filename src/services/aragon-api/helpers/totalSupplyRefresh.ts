import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { EnumQueueName } from '@types'

const llo = logger.logMeta.bind(null, { service: 'TotalSupplyRefresh' })

interface TokenLike {
  address: string
  network: string
  hasTotalSupply?: boolean
  totalSupplyUpdatedAt?: Date | null
}

const isTotalSupplyStale = (token: TokenLike): boolean => {
  if (!token.hasTotalSupply) return false
  if (!token.totalSupplyUpdatedAt) return true

  const age = Date.now() - new Date(token.totalSupplyUpdatedAt).getTime()
  return age > config.SERVICES.ARAGON_API.TOTAL_SUPPLY_TTL
}

const refreshTotalSupply = async (
  token: TokenLike,
): Promise<{ totalSupply: string; totalSupplyUpdatedAt: Date } | null> => {
  try {
    const result = await RabbitMQHelper.sendMessage(
      EnumQueueName.tokenTotalSupply,
      {
        id: `tokenTotalSupply-${token.network}-${token.address}`,
        params: { address: token.address, network: token.network },
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )
    return result as { totalSupply: string; totalSupplyUpdatedAt: Date } | null
  } catch (error) {
    logger.warn('Failed to refresh totalSupply', llo({ error, address: token.address, network: token.network }))
    return null
  }
}

const refreshIfStale = async (token: TokenLike): Promise<void> => {
  if (!isTotalSupplyStale(token)) return

  const result = await refreshTotalSupply(token)
  if (result) {
    ;(token as any).totalSupply = result.totalSupply
    ;(token as any).totalSupplyUpdatedAt = result.totalSupplyUpdatedAt
  }
}

interface AggTokenRef {
  address: string
  network: string
}

const refreshAggregationResults = async <T>(
  results: T[],
  tokenExtractor: (item: T) => AggTokenRef | null | undefined,
  tokenSetter: (item: T, totalSupply: string) => void,
): Promise<void> => {
  const uniqueTokens = new Map<string, AggTokenRef>()

  for (const item of results) {
    const token = tokenExtractor(item)
    if (token) {
      const key = `${token.network}-${token.address}`
      if (!uniqueTokens.has(key)) {
        uniqueTokens.set(key, token)
      }
    }
  }

  if (uniqueTokens.size === 0) return

  const dbTokens = await Models.Token.find(
    {
      $or: Array.from(uniqueTokens.values()).map(t => ({ address: t.address, network: t.network })),
      hasTotalSupply: true,
    },
    { address: 1, network: 1, totalSupplyUpdatedAt: 1 },
  )

  const staleTokens = dbTokens.filter(t => isTotalSupplyStale(t))
  if (staleTokens.length === 0) return

  const refreshResults = new Map<string, string>()
  await Promise.all(
    staleTokens.map(async t => {
      const key = `${t.network}-${t.address}`
      const result = await refreshTotalSupply(t)
      if (result) {
        refreshResults.set(key, result.totalSupply)
      }
    }),
  )

  for (const item of results) {
    const token = tokenExtractor(item)
    if (!token) continue
    const key = `${token.network}-${token.address}`
    const totalSupply = refreshResults.get(key)
    if (totalSupply) {
      tokenSetter(item, totalSupply)
    }
  }
}

export const TotalSupplyRefresh = {
  isTotalSupplyStale,
  refreshIfStale,
  refreshAggregationResults,
}
