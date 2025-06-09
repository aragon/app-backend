import logger from '@logger'
import { type LogDescription } from 'ethers'
import { type ILogInfo } from '@types'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceVeHandler' })

export const GovernanceVeHandler = {
  delegateTokens: async (_parsedEvent: LogDescription, _info: ILogInfo) => {
    // event TokensDelegated(address indexed sender, address indexed delegatee, uint256[] tokenIds);
  },

  unDelegateTokens: async (_parsedEvent: LogDescription, _info: ILogInfo) => {
    // event TokensUndelegated(address indexed sender, address indexed delegatee, uint256[] tokenIds);
  },

  deposit: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugin = await Models.Plugin.findOne({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (!plugin) {
      logger.error('Plugin not found for deposit event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.depositor
    const tokenId = parsedEvent.args.tokenId.toString()
    const amount = parsedEvent.args.value.toString()
    const epochStartAt = Number(parsedEvent.args.startTs)
    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
    const totalLocked = parsedEvent.args.newTotalLocked.toString()

    await ProxyMember.createMember(memberAddress)
    await Models.Lock.create({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      blockNumber: info.blockNumber,
      blockTimestamp,
      pluginAddress: plugin.address,
      daoAddress: plugin.daoAddress,
      memberAddress,
      nftAddress: plugin.votingEscrow.nftLockAddress,
      tokenAddress: plugin.tokenAddress,
      tokenId,
      amount,
      epochStartAt,
      totalLocked,
    })
    await ProxyMember.addToDao(memberAddress)

    logger.verbose('Deposit VeGovernance', llo({ info, memberAddress, tokenId }))
  },

  withdraw: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugin = await Models.Plugin.findOne({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (!plugin) {
      logger.error('Plugin not found for withdraw event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.depositor
    const tokenId = parsedEvent.args.tokenId.toString()
    const amount = parsedEvent.args.value.toString()
    const epochEndAt = Number(parsedEvent.args.ts)
    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
    const totalLocked = parsedEvent.args.newTotalLocked.toString()

    const memberLock = await Models.Lock.findLockMember({
      network: info.network,
      pluginAddress: plugin.address,
      tokenId,
      memberAddress,
    })

    if (!memberLock) {
      logger.error(
        'Lock not found for withdraw event',
        llo({
          info,
          memberAddress,
          tokenId,
          pluginAddress: plugin.address,
        }),
      )
      return
    }

    await memberLock.update({
      lockWithdraw: {
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp,
        totalLocked,
        amount,
        epochEndAt,
      },
    })
    await ProxyMember.removeFromDao(memberAddress)

    logger.verbose('Withdraw VeGovernance', llo({ info, memberAddress, tokenId }))
  },

  exitQueued: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugin = await Models.Plugin.findOne({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (!plugin) {
      logger.error('Plugin not found for exitQueued event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.holder
    const tokenId = parsedEvent.args.tokenId.toString()
    const exitDateAt = Number(parsedEvent.args.exitDate)
    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined

    const memberLock = await Models.Lock.findLockMember({
      network: info.network,
      pluginAddress: plugin.address,
      tokenId,
      memberAddress,
    })

    if (!memberLock) {
      logger.error(
        'Lock not found for exitQueued event',
        llo({
          info,
          memberAddress,
          tokenId,
          pluginAddress: plugin.address,
        }),
      )
      return
    }

    await memberLock.update({
      lockExit: {
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp,
        exitDateAt,
      },
    })

    logger.verbose('Exit queued VeGovernance', llo({ info, memberAddress, tokenId }))
  },

  minDepositSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugin = await Models.Plugin.findOne({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (!plugin) {
      logger.error('Plugin not found for minDepositSet event', llo({ info }))
      return
    }

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress: plugin.address,
    })

    if (!activePluginSetting) {
      logger.error(
        'Active plugin setting not found for minDepositSet event',
        llo({
          info,
          pluginAddress: plugin.address,
        }),
      )
      return
    }

    activePluginSetting.votingEscrow.minDeposit = parsedEvent.args.minDeposit.toString()
    await activePluginSetting.save()

    logger.verbose('minDepositSet VeGovernance', llo({ info }))
  },

  minLockSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugin = await Models.Plugin.findOne({
      'votingEscrow.exitQueueAddress': info.address,
      network: info.network,
    })

    if (!plugin) {
      logger.error('Plugin not found for minLockSet event', llo({ info }))
      return
    }

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress: plugin.address,
    })

    if (!activePluginSetting) {
      logger.error(
        'Active plugin setting not found for minLockSet event',
        llo({
          info,
          pluginAddress: plugin.address,
        }),
      )
      return
    }

    activePluginSetting.votingEscrow.minLockTime = Number(parsedEvent.args.minLock)
    await activePluginSetting.save()

    logger.verbose('minLockSet VeGovernance', llo({ info }))
  },
}
