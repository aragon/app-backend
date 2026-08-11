import logger from '@logger'
import { ethers } from 'ethers'
import { setBalance } from '../../helpers/anvilRpc'
import { getAnvilProvider } from '../../helpers/constants'

export const DAO_FACTORY = '0x246503df057A9a85E0144b6867a828c99676128B'
export const PSP = '0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f'

export const ADMIN_REPO = '0xA4371a239D08bfBA6E8894eccf8466C6323A52C3'
export const ADMIN_RELEASE = 1
export const ADMIN_BUILD = 2

export const DAO_FACTORY_ABI = [
  'function createDao(tuple(address trustedForwarder, string daoURI, string subdomain, bytes metadata) _daoSettings, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes data)[] _pluginSettings) returns (address createdDao)',
]

export const PSP_ABI = [
  'function APPLY_INSTALLATION_PERMISSION_ID() view returns (bytes32)',
  'function prepareInstallation(address dao, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes data) params) returns (address plugin, tuple(address[] helpers, tuple(uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)',
  'function applyInstallation(address dao, tuple(tuple(tuple(uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, tuple(uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) params)',
  'event InstallationApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId, bytes32 appliedSetupId)',
]

export const DAO_REGISTRY_ABI = ['event DAORegistered(address indexed dao, address indexed creator, string subdomain)']

export const DAO_ABI = [
  'function grant(address where, address who, bytes32 permissionId)',
  'function grantWithCondition(address where, address who, bytes32 permissionId, address condition)',
  'function ROOT_PERMISSION_ID() view returns (bytes32)',
]

// Admin plugin (build 2) auto-executes on createProposal.
export const ADMIN_ABI = [
  'function createProposal(bytes _metadata, tuple(address to, uint256 value, bytes data)[] _actions, uint64, uint64, bytes _data) returns (uint256 proposalId)',
]

export interface AdminAction {
  to: string
  value: bigint
  data: string
}

export interface AdminDaoBootstrap {
  dao: string
  adminPlugin: string
  daoContract: ethers.Contract
  psp: ethers.Contract
  adminExecute: (actions: AdminAction[]) => Promise<ethers.TransactionReceipt>
}

export interface PluginSetupRef {
  versionTag: { release: number; build: number }
  pluginSetupRepo: string
}

/** Fresh random wallet with a local nonce counter and 10 ETH, ready for anvil's block-time race. */
export async function createDeployer(): Promise<{ wallet: ethers.HDNodeWallet; deployer: ethers.NonceManager }> {
  const provider = getAnvilProvider()
  const wallet = ethers.Wallet.createRandom().connect(provider) as ethers.HDNodeWallet
  const deployer = new ethers.NonceManager(wallet)
  await setBalance(wallet.address, 10n ** 19n)
  return { wallet, deployer }
}

/**
 * Deploys a fresh DAO with only the Admin plugin (deployer = admin), then grants the
 * PSP ROOT on the DAO and the deployer APPLY_INSTALLATION on the PSP, so follow-up
 * plugin installations can run directly from the deployer.
 */
export async function deployAdminDao(
  deployer: ethers.NonceManager,
  deployerAddress: string,
): Promise<AdminDaoBootstrap> {
  const provider = getAnvilProvider()

  const adminInstallData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'tuple(address target, uint8 operation)'],
    [deployerAddress, { target: ethers.ZeroAddress, operation: 0 }],
  )

  const factory = new ethers.Contract(DAO_FACTORY, DAO_FACTORY_ABI, deployer)
  const createDaoReceipt = await (
    await factory.createDao({ trustedForwarder: ethers.ZeroAddress, daoURI: '', subdomain: '', metadata: '0x' }, [
      {
        pluginSetupRef: { versionTag: { release: ADMIN_RELEASE, build: ADMIN_BUILD }, pluginSetupRepo: ADMIN_REPO },
        data: adminInstallData,
      },
    ])
  ).wait()

  const daoRegistryInterface = new ethers.Interface(DAO_REGISTRY_ABI)
  const daoRegisteredTopic = daoRegistryInterface.getEvent('DAORegistered')!.topicHash
  const daoLog = createDaoReceipt.logs.find((l: ethers.Log) => l.topics[0] === daoRegisteredTopic)
  if (!daoLog) throw new Error('osxBootstrap: DAORegistered event not found')
  const dao: string = daoRegistryInterface.parseLog(daoLog)!.args.dao

  const pspInterface = new ethers.Interface(PSP_ABI)
  const installationAppliedTopic = pspInterface.getEvent('InstallationApplied')!.topicHash
  const adminInstallLog = createDaoReceipt.logs.find(
    (l: ethers.Log) => l.address.toLowerCase() === PSP.toLowerCase() && l.topics[0] === installationAppliedTopic,
  )
  if (!adminInstallLog) throw new Error('osxBootstrap: Admin InstallationApplied not found')
  const adminPlugin: string = pspInterface.parseLog(adminInstallLog)!.args.plugin
  logger.info(`osxBootstrap: dao=${dao} adminPlugin=${adminPlugin}`)

  const daoContract = new ethers.Contract(dao, DAO_ABI, provider)
  const psp = new ethers.Contract(PSP, PSP_ABI, deployer)
  const adminContract = new ethers.Contract(adminPlugin, ADMIN_ABI, deployer)

  const adminExecute = async (actions: AdminAction[]) =>
    (await adminContract.createProposal('0x', actions, 0, 0, '0x')).wait()

  const ROOT: string = await daoContract.ROOT_PERMISSION_ID()
  const APPLY_INSTALLATION: string = await psp.APPLY_INSTALLATION_PERMISSION_ID()

  await adminExecute([
    { to: dao, value: 0n, data: daoContract.interface.encodeFunctionData('grant', [dao, PSP, ROOT]) },
    {
      to: dao,
      value: 0n,
      data: daoContract.interface.encodeFunctionData('grant', [PSP, deployerAddress, APPLY_INSTALLATION]),
    },
  ])
  logger.info('osxBootstrap: PSP permission grants executed')

  return { dao, adminPlugin, daoContract, psp, adminExecute }
}

/**
 * The PSP prepare + apply dance: static-call to learn the plugin address, helpers and
 * permissions, then prepare and apply for real.
 */
export async function pspInstall(
  psp: ethers.Contract,
  dao: string,
  pluginSetupRef: PluginSetupRef,
  data: string,
): Promise<{ plugin: string; helpers: string[] }> {
  const prepared = await psp.prepareInstallation.staticCall(dao, { pluginSetupRef, data })
  const plugin: string = prepared.plugin
  const helpers: string[] = Array.from(prepared.preparedSetupData.helpers as string[])
  const permissions = (prepared.preparedSetupData.permissions as ethers.Result[]).map(p => ({
    operation: Number(p[0]),
    where: p[1] as string,
    who: p[2] as string,
    condition: p[3] as string,
    permissionId: p[4] as string,
  }))
  await (await psp.prepareInstallation(dao, { pluginSetupRef, data })).wait()

  const helpersHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [helpers]))
  await (await psp.applyInstallation(dao, { pluginSetupRef, plugin, permissions, helpersHash })).wait()

  return { plugin, helpers }
}
