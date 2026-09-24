import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import ProviderModule from '@modules/provider'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeRelationsModule from '@modules/safe/safeRelations'
import { BaseGovernance } from '@src/governance'
import { EnumQueueName, type HexAddress, type NetworksEnum } from '@types'
import { getAddress } from 'ethers'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBodyMembers' })

const requestDaoMetrics = async (daoAddress: HexAddress, network: NetworksEnum) => {
  try {
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: daoAddress,
      params: { address: daoAddress, network },
    })
  } catch (error) {
    logger.warn('Unable to enqueue DAO metrics refresh for Safe membership', llo({ daoAddress, network, error }))
  }
}

const SafeBodyMembersModule = {
  /**
   * Replace a Safe's stored owners with one complete snapshot. The owners are read pinned to a block,
   * and the `SafeOwnerSync` checkpoint for the Safe records that block inside the same transaction as
   * the row changes, so two writers queue on it and an older snapshot never overwrites a newer one.
   * An empty or inconclusive read writes nothing: a Safe always has at least one owner.
   */
  async syncOwners(
    network: NetworksEnum,
    safeAddress: HexAddress,
  ): Promise<{ blockNumber: number; added: number; removed: number } | null> {
    const blockNumber = await ProviderModule.getAnyRpcProvider(network).getBlockNumber()
    const owners = ((await SafeChainReaderModule.readOwners(network, safeAddress, blockNumber)) ?? []) as HexAddress[]
    if (!owners.length) {
      logger.warn('Safe owner snapshot is empty, nothing written', llo({ network, safeAddress, blockNumber }))
      return null
    }

    const stored = await Models.SafeMember.find({ network, safeAddress }).select('memberAddress').lean()
    const have = new Set<HexAddress>(stored.map(row => row.memberAddress))
    const want = new Set<HexAddress>(owners)
    const missing = owners.filter(owner => !have.has(owner))
    const stale = [...have].filter(owner => !want.has(owner))

    // A base row carries an ENS lookup, so it is ensured before the transaction, never inside it.
    for (const owner of missing) await BaseGovernance.ensureBaseMember(owner)

    const outcome = await DbTx.executeTxFn(async ({ session }: { session: ClientSession }) => {
      const checkpoint = await Models.SafeOwnerSync.findOne({ network, safeAddress }, null, { session })
      if (checkpoint && checkpoint.blockNumber >= blockNumber) {
        logger.verbose('Safe owner snapshot is older than the checkpoint', llo({ network, safeAddress, blockNumber }))
        return null
      }

      await Models.SafeOwnerSync.updateOne(
        { network, safeAddress },
        {
          $set: { blockNumber },
          $setOnInsert: { id: Models.SafeOwnerSync.getEntityId(network, safeAddress), network, safeAddress },
        },
        { upsert: true, session },
      )
      if (missing.length) {
        await Models.SafeMember.insertMany(
          missing.map(memberAddress => ({
            id: Models.SafeMember.getEntityId({ network, safeAddress, memberAddress }),
            network,
            safeAddress,
            memberAddress,
          })),
          { session },
        )
      }
      if (stale.length) {
        await Models.SafeMember.deleteMany({ network, safeAddress, memberAddress: { $in: stale } }, { session })
      }
      await session.commitTransaction()
      await session.endSession()

      return { blockNumber, added: missing.length, removed: stale.length }
    })

    // On a duplicate key the helper hands back the existing document: another writer took the
    // checkpoint first and this snapshot was not applied.
    return outcome && 'added' in outcome ? outcome : null
  },

  /** Bring every Safe this DAO can see to its full current owner set, then refresh the DAO's metrics. */
  async seedDao(daoAddress: HexAddress, network: NetworksEnum): Promise<void> {
    try {
      const safeAddresses = await SafeRelationsModule.getSafeAddresses(daoAddress, network)
      for (const safeAddress of safeAddresses) {
        try {
          await SafeBodyMembersModule.syncOwners(network, safeAddress)
        } catch (error) {
          logger.warn('Unable to seed Safe body owners', llo({ daoAddress, network, safeAddress, error }))
        }
      }
    } catch (error) {
      logger.warn('Unable to discover Safe bodies for seeding', llo({ daoAddress, network, error }))
    }

    await requestDaoMetrics(daoAddress, network)
  },

  /**
   * An owner event of any Safe on the network. A Safe that reaches no DAO and has no stored rows is
   * dropped before any chain read. The event only says something changed; the chain says what the
   * owners are now, so the answer is a full snapshot.
   */
  async ownerChanged(network: NetworksEnum, rawSafeAddress: string): Promise<number> {
    const safeAddress = getAddress(rawSafeAddress) as HexAddress
    const daos = await SafeRelationsModule.findDaos([safeAddress], network)
    if (!daos.length && !(await Models.SafeMember.exists({ network, safeAddress }))) return 0

    await SafeBodyMembersModule.syncOwners(network, safeAddress)
    for (const { daoAddress } of daos) await requestDaoMetrics(daoAddress, network)

    return daos.length
  },
}

export default SafeBodyMembersModule
