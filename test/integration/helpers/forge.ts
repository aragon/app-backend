import { execFileSync } from 'child_process'
import path from 'path'
import { startServices, stopServices } from './services'
import { getWallet } from './wallet'

const FOUNDRY_ROOT = path.resolve(__dirname, '../foundry')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://localhost:8545'

function runForgeScript(scriptName: string): void {
  const scriptPath = path.join(FOUNDRY_ROOT, 'scripts', scriptName)
  execFileSync(
    'forge',
    [
      'script',
      scriptPath,
      '--root',
      FOUNDRY_ROOT,
      '--rpc-url',
      ANVIL_RPC,
      '--broadcast',
      '--private-key',
      getWallet().privateKey,
    ],
    { stdio: 'inherit' },
  )
}

export async function prepareAndRunForge(scriptName: string, waitMs = 10_000): Promise<void> {
  await startServices()
  try {
    runForgeScript(scriptName)
    await new Promise(resolve => setTimeout(resolve, waitMs))
  } finally {
    stopServices()
  }
}
