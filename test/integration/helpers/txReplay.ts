import configIndexer from '@indexer/configIndexer'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import { type HexAddress, NetworksEnum } from '@types'
import { ethers, type Log } from 'ethers'
import { getAnvilProvider, getMainnetProvider, MAINNET_RPC } from './constants'
import { UnitTestUtils } from '@test/lib/utils'
import logger from '@logger'

export async function resetFork(blockNumber: number): Promise<void> {
  const provider = getAnvilProvider()
  await provider.send('anvil_reset', [{ forking: { jsonRpcUrl: MAINNET_RPC, blockNumber } }])
}

export async function replayTransactions(txHashes: string[]): Promise<void> {
  const mainnet = getMainnetProvider()
  const anvil = getAnvilProvider()

  logger.info(`Fetching ${txHashes.length} transactions from mainnet...`)
  const txs = await Promise.all(
    txHashes.map(async txHash => {
      const tx = await mainnet.getTransaction(txHash)
      if (!tx) throw new Error(`Transaction not found on mainnet: ${txHash}`)
      return tx
    }),
  )

  const uniqueSenders = [...new Set(txs.map(tx => tx.from))]
  await Promise.all(
    uniqueSenders.map(async sender => {
      await anvil.send('anvil_impersonateAccount', [sender])
      await anvil.send('anvil_setBalance', [sender, '0x56BC75E2D63100000'])
    }),
  )

  logger.info(`Replaying ${txs.length} transactions on Anvil fork...`)
  for (const tx of txs) {
    await anvil.send('eth_sendTransaction', [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: ethers.toBeHex(tx.value),
      },
    ])
  }

  await Promise.all(uniqueSenders.map(sender => anvil.send('anvil_stopImpersonatingAccount', [sender])))
}

export async function discoverDaoTxHashes(
  daoAddress: HexAddress,
  network: NetworksEnum,
): Promise<{ forkBlock: number; txHashes: string[] }> {
  const creation = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, daoAddress, network)
  if (!creation.blockNumber || !creation.transactionHash) {
    throw new Error(`Could not find creation tx for DAO: ${daoAddress}`)
  }

  const fromBlock = Number(creation.blockNumber)
  const pspAddress = (await UnitTestUtils.getPspAddressMap())[network]
  if (!pspAddress) {
    throw new Error(`No PSP address configured for network: ${network}`)
  }

  const provider = getMainnetProvider()
  const daoAddressFilter = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [daoAddress])

  const grantedRevokedTopics = configIndexer
    .filter(config => config.event === 'Granted' || config.event === 'Revoked')
    .map(config => config.topic)

  const pspTopics = configIndexer
    .filter(
      config =>
        config.event === 'InstallationPrepared' ||
        config.event === 'InstallationApplied' ||
        config.event === 'UninstallationPrepared' ||
        config.event === 'UpdatePrepared',
    )
    .map(config => config.topic)

  const daoLogs = (await provider.getLogs({
    address: daoAddress,
    fromBlock,
    toBlock: 'latest',
    topics: [grantedRevokedTopics],
  })) as Log[]

  const pspLogs = (await provider.getLogs({
    address: pspAddress,
    fromBlock,
    toBlock: 'latest',
    topics: [pspTopics, null, [daoAddressFilter]],
  })) as Log[]

  const allLogs = [...daoLogs, ...pspLogs].sort((a, b) => a.blockNumber - b.blockNumber)
  const txHashes = Array.from(new Set(allLogs.map(log => log.transactionHash)))

  return { forkBlock: fromBlock - 1, txHashes }
}
