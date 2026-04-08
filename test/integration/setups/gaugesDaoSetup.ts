import { ethers } from 'ethers'
import { getAnvilProvider } from '../helpers/constants'
import { impersonate, mine, setBalance, stopImpersonate } from '../helpers/anvilRpc'
import logger from '@logger'

// ── On-chain addresses (Ethereum mainnet) ─────────────────────────────────────
const FACTORY = '0x0E1a221A2A58B7A91981DE5551999203C391132F'
const PSP = '0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f'
const TOKEN_VOTING_REPO = '0xb7401cD221ceAFC54093168B814Cc3d42579287f'
const TOKEN_VOTING_RELEASE = 1
const TOKEN_VOTING_BUILD = 4 // v1.4 — adapter-as-IVotes path lives here, not in build 2
const MULTISIG_MEMBER = '0x2c763b8760AA5946DB9602a8DE095000D0E292C4' // isListed=true, minApprovals=1

// ── Minimal ABIs (human-readable) ─────────────────────────────────────────────
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

export interface GaugesDaoDeployment {
  dao: string
  multisig: string
  adapter: string
  deployer: string
  deployerWallet: ethers.HDNodeWallet
  tokenVoting: string
  votingEscrow: string
  nftLock: string
  clock: string
  exitQueue: string
  curve: string
  gaugeVoter: string
}

/**
 * Sequential, observable counterpart to the old GaugesDaoSetup.s.sol forge script.
 * Each step waits for its tx to mine, so an indexer listening to anvil sees them in order
 * and `_mineBlocks` between deploy and proposal actually creates a real block gap.
 */
export async function setupGaugesDao(): Promise<GaugesDaoDeployment> {
  const provider = getAnvilProvider()

  // 1. Deployer wallet (random, funded on anvil)
  const deployer = ethers.Wallet.createRandom().connect(provider)
  await setBalance(deployer.address, 10n ** 19n) // 10 ETH

  // 2. Deploy DAO + GaugeVoter + adapter
  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, deployer)
  logger.info('GaugesDaoSetup: calling factory.deployOnce()')
  const deployTx = await factory.deployOnce()
  await deployTx.wait()

  // 3. Read deployment addresses
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

  // 4. Advance anvil time/blocks BETWEEN deploy and proposal so
  //    lastMultisigSettingsChange < snapshotBlock when the proposal is created.
  await mine(5, 720) // 5 blocks, 720s apart → 3600s total

  // 5. Grant ROOT to deployer via multisig governance (minApprovals=1, tryExecution=true)
  const daoContract = new ethers.Contract(dao, DAO_ABI, provider)
  const ROOT: string = await daoContract.ROOT_PERMISSION_ID()

  const grantData = daoContract.interface.encodeFunctionData('grant', [dao, deployer.address, ROOT])
  const actions = [{ to: dao, value: 0n, data: grantData }]

  await setBalance(MULTISIG_MEMBER, 10n ** 19n)
  const memberSigner = await impersonate(MULTISIG_MEMBER)
  try {
    const multisigContract = new ethers.Contract(multisig, MULTISIG_ABI, memberSigner)
    const nowTs = (await provider.getBlock('latest'))!.timestamp
    const proposalTx = await multisigContract.createProposal(
      '0x',
      actions,
      0,
      true, // approveProposal
      true, // tryExecution
      0,
      nowTs + 86_400, // +1 day
    )
    await proposalTx.wait()
    logger.info('GaugesDaoSetup: createProposal mined')
  } finally {
    await stopImpersonate(MULTISIG_MEMBER)
  }

  // 6. Install TokenVoting plugin via PSP using the gauge adapter as the voting token.
  //    Deployer now holds ROOT (granted by the multisig proposal in step 5).
  const daoAsDeployer = new ethers.Contract(dao, DAO_ABI, deployer)
  const psp = new ethers.Contract(PSP, PSP_ABI, deployer)
  const APPLY_INSTALLATION = await psp.APPLY_INSTALLATION_PERMISSION_ID()

  await (await daoAsDeployer.grant(dao, PSP, ROOT)).wait()
  await (await daoAsDeployer.grant(PSP, deployer.address, APPLY_INSTALLATION)).wait()

  // TokenVotingSetup v1.4 (Release 1, Build 4) decodes 7 fields:
  //   (votingSettings, tokenSettings, mintSettings, targetConfig, minApprovals, pluginMetadata, excludedAccounts)
  // Build 2 only had the first 3 — that's why our previous encoding silently mis-installed.
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
      { target: dao, operation: 0 }, // Call into the DAO directly
      0, // minApprovals
      '0x', // pluginMetadata
      [], // excludedAccounts
    ],
  )

  const pluginSetupRef = {
    versionTag: { release: TOKEN_VOTING_RELEASE, build: TOKEN_VOTING_BUILD },
    pluginSetupRepo: TOKEN_VOTING_REPO,
  }

  // staticCall first to capture the plugin address + permissions/helpers,
  // then send the real tx (CREATE2-deterministic on PSP, so addresses match).
  const prepared = await psp.prepareInstallation.staticCall(dao, { pluginSetupRef, data: installData })
  const tvPlugin: string = prepared.plugin
  // ethers Result objects are frozen — clone into plain JS structures before re-passing
  // them to another contract call, otherwise the async encoder tries to mutate them
  // and throws "Cannot assign to read only property '0' of object".
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
    deployer: deployer.address,
    deployerWallet: deployer,
    tokenVoting: tvPlugin,
    votingEscrow,
    nftLock,
    clock,
    exitQueue,
    curve,
    gaugeVoter,
  }
}
