import { SafeNativeEvents } from '@artifacts/Safe'
import { Models } from '@dbModels'
import { DaoTransferHandler } from '@handlers/daoTransferHanlder'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ProxyWeb3Provider from '@modules/proxyProvider'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import { EnumQueueName, type HexAddress, type IQueueSafeTrack, type NetworksEnum } from '@types'
import { Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeTracking' })

const safeReceivedTopic = new Interface(SafeNativeEvents.abi).getEvent('SafeReceived')?.topicHash!

const SafeTrackingModule = {
  nativeDepositEvent: {
    event: 'SafeReceived',
    topic: safeReceivedTopic,
    config: [{ abi: SafeNativeEvents.abi, handler: DaoTransferHandler.incomingNativeDeposits }],
  },

  async start({ network, address }: IQueueSafeTrack): Promise<void> {
    // The Safe can be removed before this job runs.
    if (!(await Models.SafeAccount.findTracked(network, address))) return
    await SafeBodyMembersModule.seedSafe(network, address)
    await SafeDaoAssociationsModule.queueBackfill(network, address)
    await SafeTrackingModule.queueTransfers(network, address)
  },

  async holder(
    network: NetworksEnum,
    address: HexAddress,
  ): Promise<{ id: string; address: HexAddress; network: NetworksEnum; blockNumber: number } | null> {
    const row = await Models.SafeAccount.findTracked(network, address)
    if (!row) return null

    const blockNumber = row.blockNumber ?? (await SafeTrackingModule._creationBlock(network, address))
    if (!blockNumber) {
      logger.warn('No creation block for the Safe, transfer crawl skipped', llo({ network, address }))
      return null
    }
    return { id: row.id, address: row.safeAddress, network: row.network, blockNumber }
  },

  async queueTransfers(network: NetworksEnum, address: HexAddress): Promise<void> {
    await RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
      id: address,
      params: { daoAddress: address, network },
    })
    await RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
      id: `${network}-${address}-native`,
      params: { address, network, native: true },
    })
  },

  async trackedAddresses(network: NetworksEnum): Promise<Map<string, HexAddress>> {
    const tracked = new Map<string, HexAddress>()
    for (const { safeAddress } of await Models.SafeAccount.findAllTracked(network)) {
      tracked.set(safeAddress.toLowerCase(), safeAddress)
    }
    return tracked
  },

  async onExecution(network: NetworksEnum, address: HexAddress): Promise<void> {
    if (await Models.SafeAccount.findTracked(network, address)) {
      await SafeTrackingModule.queueTransfers(network, address)
    }
  },

  async _creationBlock(network: NetworksEnum, address: HexAddress): Promise<number | null> {
    const creation = await ProxyWeb3Provider.fetchContractCreation({ address, network })
    const blockNumber = Number(creation.blockNumber)
    if (!blockNumber) return null

    await Models.SafeAccount.updateOne({ id: Models.SafeAccount.buildId(network, address) }, { $set: { blockNumber } })
    return blockNumber
  },
}

export default SafeTrackingModule
