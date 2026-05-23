import logger from '@logger'
import { ethers } from 'ethers'
import { impersonate, mine, setBalance, stopImpersonate } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'

// Ethereum mainnet addresses.
const FACTORY = '0x0E1a221A2A58B7A91981DE5551999203C391132F'
const PSP = '0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f'
const TOKEN_VOTING_REPO = '0xb7401cD221ceAFC54093168B814Cc3d42579287f'
const TOKEN_VOTING_RELEASE = 1
const TOKEN_VOTING_BUILD = 4 // v1.4 — adapter-as-IVotes path; build 2 has a different ABI
const MULTISIG_MEMBER = '0x2c763b8760AA5946DB9602a8DE095000D0E292C4' // isListed=true, minApprovals=1

const FACTORY_ABI = [
  'function deployOnce()',
  'function getDeployment() view returns (tuple(address dao, address multisigPlugin, tuple(address plugin, address curve, address exitQueue, address votingEscrow, address clock, address nftLock, address delegationAdapter)[] gaugeVoterPluginSets, address gaugeVoterPluginRepo))',
]

const DAO_ABI = [
  'function grant(address where, address who, bytes32 permissionId)',
  'function ROOT_PERMISSION_ID() view returns (bytes32)',
]

const MULTISIG_ABI = [
  'function createProposal(bytes metadata, tuple(address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap, bool approveProposal, bool tryExecution, uint64 startDate, uint64 endDate) returns (uint256)',
]

const PSP_ABI = [
  'function APPLY_INSTALLATION_PERMISSION_ID() view returns (bytes32)',
  'function prepareInstallation(address dao, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes data) params) returns (address plugin, tuple(address[] helpers, tuple(uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)',
  'function applyInstallation(address dao, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, tuple(uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) params)',
]

export type { GaugesDaoDeployment } from '../types/gaugesFixture'

import type { GaugesDaoDeployment } from '../types/gaugesFixture'

/**
 * Deploys a fresh gauges DAO on a forked anvil and installs TokenVoting v1.4 against
 * the gauge IVotes adapter. Each tx is awaited so an indexer sees ordered events.
 */
export async function setupGaugesDao(): Promise<GaugesDaoDeployment> {
  const provider = getAnvilProvider()

  const deployerWallet = ethers.Wallet.createRandom().connect(provider)
  // NonceManager keeps a local nonce counter — eliminates the "pending"-count
  // RPC race against anvil's `--block-time 1`.
  const deployer = new ethers.NonceManager(deployerWallet)
  await setBalance(deployerWallet.address, 10n ** 19n)

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, deployer)
  logger.info('GaugesDaoSetup: calling factory.deployOnce()')
  const deployTx = await factory.deployOnce()
  await deployTx.wait()

  const dep = await factory.getDeployment()
  const dao: string = dep.dao
  const multisig: string = dep.multisigPlugin
  const set = dep.gaugeVoterPluginSets[0]
  const adapter: string = set.delegationAdapter
  const votingEscrow: string = set.votingEscrow
  const nftLock: string = set.nftLock
  const clock: string = set.clock
  const exitQueue: string = set.exitQueue
  const curve: string = set.curve
  const gaugeVoter: string = set.plugin
  if (!adapter || adapter === ethers.ZeroAddress) throw new Error('adapter not found')
  logger.info(`GaugesDaoSetup: dao=${dao} multisig=${multisig} adapter=${adapter} votingEscrow=${votingEscrow}`)

  await mine(5, 720)

  const daoContract = new ethers.Contract(dao, DAO_ABI, provider)
  const ROOT: string = await daoContract.ROOT_PERMISSION_ID()

  const grantData = daoContract.interface.encodeFunctionData('grant', [dao, deployerWallet.address, ROOT])
  const actions = [{ to: dao, value: 0n, data: grantData }]

  await setBalance(MULTISIG_MEMBER, 10n ** 19n)
  const memberSigner = await impersonate(MULTISIG_MEMBER)
  try {
    const multisigContract = new ethers.Contract(multisig, MULTISIG_ABI, memberSigner)
    const nowTs = (await provider.getBlock('latest'))!.timestamp
    const proposalTx = await multisigContract.createProposal('0x', actions, 0, true, true, 0, nowTs + 86_400)
    await proposalTx.wait()
    logger.info('GaugesDaoSetup: createProposal mined')
  } finally {
    await stopImpersonate(MULTISIG_MEMBER)
  }

  const daoAsDeployer = new ethers.Contract(dao, DAO_ABI, deployer)
  const psp = new ethers.Contract(PSP, PSP_ABI, deployer)
  const APPLY_INSTALLATION = await psp.APPLY_INSTALLATION_PERMISSION_ID()

  await (await daoAsDeployer.grant(dao, PSP, ROOT)).wait()
  await (await daoAsDeployer.grant(PSP, deployerWallet.address, APPLY_INSTALLATION)).wait()

  const installData = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'tuple(uint8 votingMode, uint32 supportThreshold, uint32 minParticipation, uint64 minDuration, uint256 minProposerVotingPower)',
      'tuple(address addr, string name, string symbol)',
      'tuple(address[] receivers, uint256[] amounts)',
      'tuple(address target, uint8 operation)',
      'uint256',
      'bytes',
      'address[]',
    ],
    [
      { votingMode: 0, supportThreshold: 500_000, minParticipation: 0, minDuration: 3600, minProposerVotingPower: 0 },
      { addr: adapter, name: 'Test', symbol: 'TEST' },
      { receivers: [], amounts: [] },
      { target: dao, operation: 0 },
      0,
      '0x',
      [],
    ],
  )

  const pluginSetupRef = {
    versionTag: { release: TOKEN_VOTING_RELEASE, build: TOKEN_VOTING_BUILD },
    pluginSetupRepo: TOKEN_VOTING_REPO,
  }

  const prepared = await psp.prepareInstallation.staticCall(dao, { pluginSetupRef, data: installData })
  const tvPlugin: string = prepared.plugin

  const helpers: string[] = Array.from(prepared.preparedSetupData.helpers as string[])
  const permissions = (prepared.preparedSetupData.permissions as ethers.Result[]).map(p => ({
    operation: Number(p[0]),
    where: p[1] as string,
    who: p[2] as string,
    condition: p[3] as string,
    permissionId: p[4] as string,
  }))
  await (await psp.prepareInstallation(dao, { pluginSetupRef, data: installData })).wait()
  logger.info(`GaugesDaoSetup: TokenVoting prepared at ${tvPlugin}`)

  const helpersHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [helpers]))
  await (
    await psp.applyInstallation(dao, {
      pluginSetupRef,
      plugin: tvPlugin,
      permissions,
      helpersHash,
    })
  ).wait()
  logger.info('GaugesDaoSetup: TokenVoting applied')

  return {
    dao,
    multisig,
    adapter,
    deployer: deployerWallet.address,
    deployerWallet,
    deployerSigner: deployer,
    tokenVoting: tvPlugin,
    votingEscrow,
    nftLock,
    clock,
    exitQueue,
    curve,
    gaugeVoter,
  }
}
