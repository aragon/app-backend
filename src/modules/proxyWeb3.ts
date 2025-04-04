import logger from '@logger'
import { type HexAddress, type IAlchemyTokenBalance, type NetworksEnum } from '@types'
import Web3 from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import AlchemyWeb3 from '@helpers/alchemyWeb3'
import Web3Utils from '@helpers/web3Utils'
import type { TransactionReceipt } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

const ProxyWeb3 = {
  getNativeBalance: async (address: HexAddress, network: NetworksEnum): Promise<string> => {
    const balance = await Web3.getNativeBalance(address, network)
    if (!balance) {
      return '0'
    }

    const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)

    if (!token) {
      logger.error('token not found balance 0', llo())
      return '0'
    }

    const parsedBalance = AlchemyWeb3.handleAlchemyCrazyBalance(balance, token?.decimals)
    AlchemyWeb3.alchemyCrazyBalanceOnError(address, token?.address, network, parsedBalance, token?.decimals)
    return parsedBalance
  },

  getTokenBalances: async (address: HexAddress, network: NetworksEnum): Promise<IAlchemyTokenBalance[]> => {
    const tokensBalance = await Web3.getTokenBalances(address, network)

    return await Promise.all(
      tokensBalance
        .filter((token: any) => token.tokenBalance !== utils.emptyData)
        .map(async (tokenBalance: any) => {
          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)

          AlchemyWeb3.alchemyCrazyBalanceOnError(
            tokenBalance.contractAddress,
            token?.address!,
            network,
            tokenBalance.tokenBalance,
            token?.decimals!,
          )

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: AlchemyWeb3.handleAlchemyCrazyBalance(tokenBalance.tokenBalance, token?.decimals),
            originalBalance: tokenBalance.tokenBalance,
          }
        }),
    )
  },

  getDataFromTxReceipt: async ({
    transactionHash,
    eventName,
    abi,
    network,
  }: {
    transactionHash: HexAddress
    eventName: string
    abi: any
    network: NetworksEnum
  }): Promise<{ txReceipt: TransactionReceipt; events: any } | undefined> => {
    const txReceipt = await Web3.getTransactionReceipt(transactionHash, network)

    if (!txReceipt) {
      logger.error('Failed to find txReceipt', llo({ txHash: transactionHash, network }))
      return
    }
    const events = Web3Utils.findLogsByName(txReceipt, eventName, abi)

    if (events.length === 0) {
      logger.error('Failed to find event', llo({ eventName, transactionHash, network }))
      return
    }

    return { txReceipt, events }
  },
}

export default ProxyWeb3
