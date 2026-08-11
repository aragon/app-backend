import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { TickContext } from '@modules/crawlers/tickContext'
import IndexerEventConfig from '@services/aragon-indexer/configIndexer'
import { type IIndexerConfig, type ILogInfo, type NetworksEnum } from '@types'
import { Interface, type Log, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:EventReplay' })

export interface IParsedConfigLog {
  event: LogDescription
  handler: any
  info: ILogInfo
}

const EventReplayHelper = {
  parseLogsByConfig(logs: Log[], network: NetworksEnum): IParsedConfigLog[] {
    const parsed: IParsedConfigLog[] = []
    for (const log of logs) {
      const setting = (IndexerEventConfig as IIndexerConfig[]).find(item =>
        Array.isArray(item.topic) ? item.topic.includes(log.topics[0]) : item.topic === log.topics[0],
      )
      if (!setting) continue

      let event: LogDescription | null = null
      let handler: any = null
      for (const configItem of setting.config ?? []) {
        try {
          event = Web3Utils.parseLog(log, new Interface(configItem.abi))
          if (event) {
            handler = configItem.handler
            break
          }
        } catch {}
      }
      if (event && handler) {
        parsed.push({ event, handler, info: Web3Utils.parseInfoLog(log, setting.event, network) })
      }
    }
    return parsed
  },

  // Re-index a single transaction: fetch its receipt and replay each configured event through its
  // handler — the same dispatch the indexer uses. Per-handler errors are isolated.
  async handleEventsFromTxHash(txHash: string, network: NetworksEnum) {
    const receipt = await Web3Helper.getTransactionReceipt(txHash as any, network)
    if (!receipt) {
      logger.warn('Transaction receipt not found', llo({ txHash, network }))
      return { txHash, network, found: false, matched: [], handled: 0, failed: 0 }
    }

    const sortedLogs = [...receipt.logs].sort((a: any, b: any) => a.index - b.index)
    const parsed = EventReplayHelper.parseLogsByConfig(sortedLogs as any, network)

    const tickCtx = new TickContext(network, sortedLogs as any)
    await tickCtx.init()

    let handled = 0
    let failed = 0
    for (const { event, handler, info } of parsed) {
      try {
        info.context = tickCtx
        await handler(event, info)
        handled++
      } catch (error) {
        failed++
        logger.error('Event handler failed', llo({ txHash, network, event: info.eventName, error }))
      }
    }

    return { txHash, network, found: true, matched: parsed.map(p => p.info.eventName), handled, failed }
  },
}

export default EventReplayHelper
