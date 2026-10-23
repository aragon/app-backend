import config from '@config'

const Redact = {
  _values: [] as string[],

  _collect(): string[] {
    const values: Array<string | null | undefined> = [
      config.MONGO_DB.URI,
      config.RABBITMQ.URI,
      config.ALCHEMY_PRICE_API.API_KEY,
      config.ANKR_CONFIG.API_KEY,
      config.ETHERSCAN_API.API_KEY,
      config.COINGECKO.API_KEY,
      config.SAFE_API.API_KEY,
      config.TENDERLY.ACCESS_KEY,
      config.PINATA.JWT,
      config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN,
      config.SERVICES.ARAGON_TELEGRAM.USER_HASH_SECRET,
      config.SERVICES.ARAGON_ADMIN_API.JWT_SECRET,
      config.LOG.LOGZIO_KEY,
    ]
    for (const node of Object.values(config.NODES)) {
      values.push(node.ALCHEMY_API_KEY, node.DRPC_API_KEY, node.ARAGON_RPC)
    }
    for (const uri of [config.MONGO_DB.URI, config.RABBITMQ.URI]) {
      const authority = uri.split('://')[1]?.split('/')[0]
      if (!authority?.includes('@')) continue
      const userinfo = authority.slice(0, authority.lastIndexOf('@'))
      values.push(userinfo)
    }
    const forms = new Set<string>()
    for (const value of values) {
      if (!value) continue
      forms.add(value)
      forms.add(encodeURIComponent(value))
      forms.add(JSON.stringify(value).slice(1, -1))
    }
    return [...forms].sort((a, b) => b.length - a.length)
  },

  text(input: string): string {
    for (const value of Redact._values) input = input.split(value).join('[REDACTED]')
    return input
  },

  payload(value: unknown): void {
    if (value == null || typeof value !== 'object') return
    const obj = value as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      const current = obj[key]
      if (typeof current === 'string') obj[key] = Redact.text(current)
      else Redact.payload(current)
    }
  },
}

Redact._values = Redact._collect()

export default Redact
