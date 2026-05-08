import logger from '@logger'
import { ethers } from 'ethers'
import { mine, setBalance } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import type { TokenVotingDaoDeployment } from '../types/tokenVotingFixture'

// Ethereum mainnet addresses — match the OSx deployment the Aragon FE actually uses
// (newer than the v1.3 entries in config/contracts/ethereumMainnet.json which reject
// ANY_ADDR Grant in applyInstallation for TokenVoting build 4).
const DAO_FACTORY = '0x246503df057A9a85E0144b6867a828c99676128B'
const PSP = '0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f'

const ADMIN_REPO = '0xA4371a239D08bfBA6E8894eccf8466C6323A52C3'
const ADMIN_RELEASE = 1
const ADMIN_BUILD = 2

const TOKEN_VOTING_REPO = '0xb7401cD221ceAFC54093168B814Cc3d42579287f'
const TOKEN_VOTING_RELEASE = 1
const TOKEN_VOTING_BUILD = 4

const DAO_FACTORY_ABI = [
  'function createDao(tuple(address trustedForwarder, string daoURI, string subdomain, bytes metadata) _daoSettings, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes data)[] _pluginSettings) returns (address createdDao)',
]

// PluginSetupProcessor ABI for the install dance after the DAO + Admin plugin exists.
const PSP_ABI = [
  'function APPLY_INSTALLATION_PERMISSION_ID() view returns (bytes32)',
  'function prepareInstallation(address dao, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes data) params) returns (address plugin, tuple(address[] helpers, tuple(uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)',
  'function applyInstallation(address dao, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, tuple(uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) params)',
  'event InstallationApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId, bytes32 appliedSetupId)',
]

// Aragon DAORegistry — emits DAORegistered when a fresh DAO is created via DAOFactory.
const DAO_REGISTRY_ABI = ['event DAORegistered(address indexed dao, address indexed creator, string subdomain)']

const DAO_ABI = [
  'function grant(address where, address who, bytes32 permissionId)',
  'function ROOT_PERMISSION_ID() view returns (bytes32)',
]

// Admin plugin (build 2) auto-executes on createProposal.
const ADMIN_ABI = [
  'function createProposal(bytes _metadata, tuple(address to, uint256 value, bytes data)[] _actions, uint64, uint64, bytes _data) returns (uint256 proposalId)',
]

const TOKEN_VOTING_ABI = ['function getVotingToken() view returns (address)', 'function token() view returns (address)']

/**
 * Deploys a fresh DAO on a forked anvil following the Aragon FE flow:
 *   1. createDao with only the Admin plugin (deployer = admin).
 *   2. Through Admin auto-execute, grant PSP root + grant deployer APPLY_INSTALLATION on PSP.
 *   3. Prepare + apply TokenVoting (build 4, plain GovernanceERC20 with 1M minted to deployer).
 *   4. Self-delegate deployer + mine so the proposal snapshot sees the voting power.
 */
export async function setupTokenVotingDao(): Promise<TokenVotingDaoDeployment> {
  const provider = getAnvilProvider()

  const deployerWallet = ethers.Wallet.createRandom().connect(provider)
  // NonceManager keeps a local nonce counter — eliminates the "pending"-count
  // RPC race against anvil's `--block-time 1` (txs queued but not yet mined).
  const deployer = new ethers.NonceManager(deployerWallet)
  await setBalance(deployerWallet.address, 10n ** 19n)

  // ───────────────── Step 1: createDao with Admin only ─────────────────
  const adminInstallData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'tuple(address target, uint8 operation)'],
    [deployerWallet.address, { target: ethers.ZeroAddress, operation: 0 }],
  )

  const adminPluginInstallation = {
    pluginSetupRef: {
      versionTag: { release: ADMIN_RELEASE, build: ADMIN_BUILD },
      pluginSetupRepo: ADMIN_REPO,
    },
    data: adminInstallData,
  }

  const daoSettings = {
    trustedForwarder: ethers.ZeroAddress,
    daoURI: '',
    subdomain: '',
    metadata: '0x',
  }

  const factory = new ethers.Contract(DAO_FACTORY, DAO_FACTORY_ABI, deployer)
  const createDaoTx = await factory.createDao(daoSettings, [adminPluginInstallation])
  const createDaoReceipt = await createDaoTx.wait()

  const daoRegistryInterface = new ethers.Interface(DAO_REGISTRY_ABI)
  const daoRegisteredTopic = daoRegistryInterface.getEvent('DAORegistered')!.topicHash
  const daoRegisteredLog = createDaoReceipt.logs.find((l: ethers.Log) => l.topics[0] === daoRegisteredTopic)
  if (!daoRegisteredLog) throw new Error('TokenVotingDaoSetup: DAORegistered event not found')
  const dao: string = daoRegistryInterface.parseLog(daoRegisteredLog)!.args.dao

  const pspInterface = new ethers.Interface(PSP_ABI)
  const installationAppliedTopic = pspInterface.getEvent('InstallationApplied')!.topicHash
  const adminInstallLog = createDaoReceipt.logs.find(
    (l: ethers.Log) => l.address.toLowerCase() === PSP.toLowerCase() && l.topics[0] === installationAppliedTopic,
  )
  if (!adminInstallLog) throw new Error('TokenVotingDaoSetup: Admin InstallationApplied not found')
  const adminPlugin: string = pspInterface.parseLog(adminInstallLog)!.args.plugin
  logger.info(`TokenVotingDaoSetup: dao=${dao} adminPlugin=${adminPlugin}`)

  // ───────────────── Step 2: Admin auto-execute → grant PSP perms ─────────────────
  const daoContract = new ethers.Contract(dao, DAO_ABI, provider)
  const psp = new ethers.Contract(PSP, PSP_ABI, deployer)
  const ROOT: string = await daoContract.ROOT_PERMISSION_ID()
  const APPLY_INSTALLATION: string = await psp.APPLY_INSTALLATION_PERMISSION_ID()

  const grantPspRootData = daoContract.interface.encodeFunctionData('grant', [dao, PSP, ROOT])
  const grantApplyToDeployerData = daoContract.interface.encodeFunctionData('grant', [
    PSP,
    deployerWallet.address,
    APPLY_INSTALLATION,
  ])

  const adminContract = new ethers.Contract(adminPlugin, ADMIN_ABI, deployer)
  const adminTx = await adminContract.createProposal(
    '0x',
    [
      { to: dao, value: 0n, data: grantPspRootData },
      { to: dao, value: 0n, data: grantApplyToDeployerData },
    ],
    0,
    0,
    '0x',
  )
  await adminTx.wait()
  logger.info('TokenVotingDaoSetup: Admin executed PSP permission grants')

  // ───────────────── Step 3: PSP prepare + apply TokenVoting ─────────────────
  const tvInstallData = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'tuple(uint8 votingMode, uint32 supportThreshold, uint32 minParticipation, uint64 minDuration, uint256 minProposerVotingPower)',
      'tuple(address addr, string name, string symbol)',
      'tuple(address[] receivers, uint256[] amounts, bool ensureDelegationOnMint)',
      'tuple(address target, uint8 operation)',
      'uint256',
      'bytes',
      'address[]',
    ],
    [
      { votingMode: 1, supportThreshold: 500_000, minParticipation: 0, minDuration: 3600, minProposerVotingPower: 0 },
      { addr: ethers.ZeroAddress, name: 'Test', symbol: 'TEST' },
      { receivers: [deployerWallet.address], amounts: [10n ** 24n], ensureDelegationOnMint: false },
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

  const prepared = await psp.prepareInstallation.staticCall(dao, { pluginSetupRef, data: tvInstallData })
  const tokenVoting: string = prepared.plugin
  const helpers: string[] = Array.from(prepared.preparedSetupData.helpers as string[])
  const permissions = (prepared.preparedSetupData.permissions as ethers.Result[]).map(p => ({
    operation: Number(p[0]),
    where: p[1] as string,
    who: p[2] as string,
    condition: p[3] as string,
    permissionId: p[4] as string,
  }))
  await (await psp.prepareInstallation(dao, { pluginSetupRef, data: tvInstallData })).wait()
  logger.info(`TokenVotingDaoSetup: TokenVoting prepared at ${tokenVoting}`)

  const helpersHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [helpers]))
  await (
    await psp.applyInstallation(dao, {
      pluginSetupRef,
      plugin: tokenVoting,
      permissions,
      helpersHash,
    })
  ).wait()
  logger.info('TokenVotingDaoSetup: TokenVoting applied')

  // ───────────────── Step 4: read token, self-delegate, mine ─────────────────
  const tvContract = new ethers.Contract(tokenVoting, TOKEN_VOTING_ABI, provider)
  let token: string
  try {
    token = await tvContract.getVotingToken()
  } catch {
    token = await tvContract.token()
  }
  logger.info(`TokenVotingDaoSetup: token=${token}`)

  const tokenContract = new ethers.Contract(token, ['function delegate(address)'], deployer)
  await (await tokenContract.delegate(deployerWallet.address)).wait()

  await mine(2, 1)

  return {
    dao,
    tokenVoting,
    token,
    deployer: deployerWallet.address,
    deployerWallet,
    deployerSigner: deployer,
  }
}
