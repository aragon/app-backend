import { type IQueueSyncMember, ISyncMember } from '@types'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { getAddress } from 'ethers'
import { Models } from '@dbModels'

const SyncMember = {
  process: async (params: IQueueSyncMember) => {
    const { pluginAddress, tokenAddress, network, members } = params

    const plugin = await Models.Plugin.findOne({
      address: pluginAddress,
      network,
    })

    await Promise.all(
      members.map(async (holder: ISyncMember) => {
        const balanceAmount = holder.value.toString()
        if (balanceAmount === '0') return

        const member = await ProxyMember.createMember(holder.address)

        const memberBalanceDb = await ProxyMember.getBalances({
          address: getAddress(holder.address),
          tokenAddress: getAddress(tokenAddress),
          network,
        })

        if (!(member && memberBalanceDb)) return

        await DbTx.executeTxFn(async ({ session }) => {
          await memberBalanceDb?.increaseBalance(
            {
              amount: balanceAmount,
              blockNumber: plugin.blockNumber,
            },
            { session },
          )
          await session.commitTransaction()
          await session.endSession()
        })

        await ProxyMember.addToDao({
          memberAddress: holder.address,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          tokenAddress: plugin.tokenAddress,
          network: plugin.network,
        })
      }),
    )
  },
}

export default SyncMember
