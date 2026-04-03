import { execSync } from 'child_process'
import path from 'path'
import { startServices, stopServices } from './services'

const FOUNDRY_ROOT = path.resolve(__dirname, '../foundry')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://localhost:8545'
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

function runForgeScript(scriptName: string): void {
  const scriptPath = path.join(FOUNDRY_ROOT, 'scripts', scriptName)
  execSync(
    `forge script ${scriptPath} --root ${FOUNDRY_ROOT} --rpc-url ${ANVIL_RPC} --broadcast --private-key ${DEPLOYER_KEY}`,
    { stdio: 'inherit' },
  )
}

export async function prepareAndRunForge(scriptName: string, waitMs = 10_000): Promise<void> {
  await startServices()
  runForgeScript(scriptName)
  await new Promise(resolve => setTimeout(resolve, waitMs))
  stopServices()
}
