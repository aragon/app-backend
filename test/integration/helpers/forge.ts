import { type HexAddress, NetworksEnum } from '@types'
import { execFileSync } from 'child_process'
import path from 'path'
import { ANVIL_RPC, getAnvilProvider } from './constants'
import { startServices, stopServices, waitForIndexerCatchup } from './services'
import { discoverDaoTxHashes, replayTransactions, resetFork } from './txReplay'
import { generateWallet, getWallet } from './wallet'

const FOUNDRY_ROOT = path.resolve(__dirname, '../foundry')

function runForgeScript(scriptName: string): void {
  const scriptPath = path.join(FOUNDRY_ROOT, 'scripts', scriptName)
  const key = getWallet().privateKey
  execFileSync(
    'forge',
    ['script', scriptPath, '--root', FOUNDRY_ROOT, '--rpc-url', ANVIL_RPC, '--broadcast', '--private-key', key],
    { stdio: 'inherit' },
  )
}

export async function prepareAndRunForge(scriptName: string, waitMs = 10_000): Promise<void> {
  await generateWallet()
  runForgeScript(scriptName)
  const latestBlock = await getAnvilProvider().getBlockNumber()
  await startServices()
  try {
    await waitForIndexerCatchup(latestBlock, waitMs)
  } finally {
    stopServices()
  }
}

export async function prepareWithReplay(
  forkBlock: number,
  txHashes: string[],
  forgeScript?: string,
  waitMs = 10_000,
): Promise<void> {
  await resetFork(forkBlock)
  await replayTransactions(txHashes)
  if (forgeScript) {
    runForgeScript(forgeScript)
  }
  const latestBlock = await getAnvilProvider().getBlockNumber()
  await startServices(forkBlock)
  try {
    await waitForIndexerCatchup(latestBlock, waitMs)
  } finally {
    stopServices()
  }
}

export async function prepareWithDaoReplay(
  daoAddress: HexAddress,
  network = NetworksEnum.ethereumMainnet,
  forgeScript?: string,
  waitMs = 10_000,
): Promise<void> {
  const { forkBlock, txHashes } = await discoverDaoTxHashes(daoAddress, network)
  await prepareWithReplay(forkBlock, txHashes, forgeScript, waitMs)
}
