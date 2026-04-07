import { type HexAddress, NetworksEnum } from '@types'
import { execFileSync } from 'child_process'
import path from 'path'
import { ANVIL_RPC, MAINNET_RPC, getAnvilProvider, getMainnetProvider } from './constants'
import { startServices, stopServices, waitForIndexerCatchup } from './services'
import { discoverDaoTxHashes, replayTransactions, resetFork } from './txReplay'
import { generateWallet, getWallet } from './wallet'
import logger from '@logger'

const FOUNDRY_ROOT = path.resolve(__dirname, '../foundry')

// We always do a full anvil_reset before each forge test. Snapshot/revert was
// fragile (snapshot ids returned as 0x0 after a reset, can't be reverted) and
// bled state between tests in non-obvious ways. anvil_reset re-forks at the
// current mainnet head, wiping every state change from prior tests in any
// process. Costs a few seconds per forge test but is bulletproof.
async function ensureCleanFork(): Promise<void> {
  const anvil = getAnvilProvider()
  const mainnet = getMainnetProvider()
  const latest = await mainnet.getBlockNumber()
  await anvil.send('anvil_reset', [{ forking: { jsonRpcUrl: MAINNET_RPC, blockNumber: latest } }])
  logger.info(`Reset Anvil fork to mainnet block ${latest}`)
}

function runForgeScript(scriptName: string): void {
  const scriptPath = path.join(FOUNDRY_ROOT, 'scripts', scriptName)
  const key = getWallet().privateKey
  execFileSync('forge', ['script', scriptPath, '--root', FOUNDRY_ROOT, '--rpc-url', ANVIL_RPC, '--broadcast'], {
    stdio: 'inherit',
    env: { ...process.env, DEPLOYER_PRIVATE_KEY: key },
  })
}

export async function prepareAndRunForge(scriptName: string, waitMs = 10_000): Promise<void> {
  await ensureCleanFork()
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
  options: { extraTxHashes?: string[]; forgeScript?: string; waitMs?: number } = {},
): Promise<void> {
  const { extraTxHashes = [], forgeScript, waitMs = 10_000 } = options

  const { forkBlock, txHashes } = await discoverDaoTxHashes(daoAddress, network)

  const allTxHashes = extraTxHashes.length ? [...txHashes, ...extraTxHashes] : txHashes
  if (extraTxHashes.length) {
    logger.info(`Appending ${extraTxHashes.length} extra tx(s) to replay`)
  }

  await prepareWithReplay(forkBlock, allTxHashes, forgeScript, waitMs)
}
