import AuditRunner from '@modules/audit/runner'
import Connections from '@modules/connections'
import { EnumConnection, type HexAddress, type NetworksEnum } from '@types'
import { ethers } from 'ethers'

function parseArgs(): { network: NetworksEnum; pluginAddress: HexAddress; proposalIndex: string } {
  const [, , networkArg, pluginArg, indexArg] = process.argv
  if (!networkArg || !pluginArg || !indexArg) {
    throw new Error('Usage: yarn audit:proposal <network> <pluginAddress> <proposalIndex>')
  }
  if (!ethers.isAddress(pluginArg)) {
    throw new Error(`Invalid pluginAddress: ${pluginArg}`)
  }
  if (!/^\d+$/.test(indexArg)) {
    throw new Error(`proposalIndex must be a non-negative integer, got: ${indexArg}`)
  }
  return {
    network: networkArg as NetworksEnum,
    pluginAddress: ethers.getAddress(pluginArg) as HexAddress,
    proposalIndex: indexArg,
  }
}

async function main() {
  const params = parseArgs()
  await Connections.open([EnumConnection.MONGODB])
  try {
    const { audit } = await AuditRunner.run(params)
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`)
  } finally {
    await Connections.close()
  }
}

main().catch(async err => {
  process.stderr.write(`${err?.message || String(err)}\n`)
  try {
    await Connections.close()
  } catch {}
  process.exit(1)
})