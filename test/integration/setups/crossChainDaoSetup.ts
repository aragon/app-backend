import logger from '@logger'
import { ethers } from 'ethers'
import CCIPAdapterArtifact from '../artifacts/crosschain/CCIPAdapter.json'
import CCIPRelayRouterMockArtifact from '../artifacts/crosschain/CCIPRelayRouterMock.json'
import CrossChainControllerArtifact from '../artifacts/crosschain/CrossChainController.json'
import CrossChainControllerSetupArtifact from '../artifacts/crosschain/CrossChainControllerSetup.json'
import ExecuteSelectorConditionArtifact from '../artifacts/crosschain/ExecuteSelectorCondition.json'
import { mine } from '../helpers/anvilRpc'
import type { CrossChainDaoDeployment } from '../types/crossChainFixture'
import { createDeployer, deployAdminDao, pspInstall } from './shared/osxBootstrap'

// OSx v1.4 PluginRepoFactory — the one currently holding REGISTER_PLUGIN_REPO_PERMISSION
// on the PluginRepoRegistry (the v1.3 factory in config/contracts lost it).
// Mirrors what aragon/crosschain's script/CreateRepo.sol does with PLUGIN_REPO_FACTORY_ADDRESS.
const PLUGIN_REPO_FACTORY = '0xcf59C627b7a4052041C4F16B4c635a960e29554A'

// CCIP chain selector for Ethereum mainnet (CCIPAdapter.toNativeChainId(1)).
const ETH_CHAIN_SELECTOR = 5009297550715157269n
const CHAIN_ID = 1

const PLUGIN_REPO_FACTORY_ABI = [
  'function createPluginRepoWithFirstVersion(string _subdomain, address _pluginSetup, address _maintainer, bytes _releaseMetadata, bytes _buildMetadata) returns (address pluginRepo)',
]

const CONTROLLER_ABI = CrossChainControllerArtifact.abi
const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)']

/**
 * Installs a CrossChainController on a fresh DAO through the real mainnet PSP on the
 * anvil fork, then wires a loopback lane (chain 1 -> chain 1) with the relay router
 * mock, drives the controller's configuration, one forwardMessage proposal and an
 * ExecuteSelectorCondition allow/disallow cycle.
 *
 * The plugins service (and so the LogCrossChain backfill) is not started by the
 * integration harness, so init-time events (ExecutorUpdated/MinFailedMessageGasUpdated
 * emitted inside prepareInstallation) are intentionally re-driven post-install via
 * admin proposals — that is the realtime indexing path this fixture exercises.
 */
export async function setupCrossChainDao(): Promise<CrossChainDaoDeployment> {
  const { wallet, deployer } = await createDeployer()
  const { dao, adminPlugin, daoContract, psp, adminExecute } = await deployAdminDao(deployer, wallet.address)

  // ───────────────── CCC impl + setup, PluginRepo registration ─────────────────
  const controllerImpl = await (
    await new ethers.ContractFactory(CONTROLLER_ABI, CrossChainControllerArtifact.bytecode, deployer).deploy()
  ).waitForDeployment()

  const setupContract = await (
    await new ethers.ContractFactory(
      CrossChainControllerSetupArtifact.abi,
      CrossChainControllerSetupArtifact.bytecode,
      deployer,
    ).deploy(await controllerImpl.getAddress())
  ).waitForDeployment()
  const setupAddress = await setupContract.getAddress()

  const repoFactory = new ethers.Contract(PLUGIN_REPO_FACTORY, PLUGIN_REPO_FACTORY_ABI, deployer)
  const subdomain = `crosschain-int-${ethers.hexlify(ethers.randomBytes(4)).slice(2)}`
  const pluginRepo: string = await repoFactory.createPluginRepoWithFirstVersion.staticCall(
    subdomain,
    setupAddress,
    wallet.address,
    '0x11',
    '0x11',
  )
  await (
    await repoFactory.createPluginRepoWithFirstVersion(subdomain, setupAddress, wallet.address, '0x11', '0x11')
  ).wait()
  logger.info(`CrossChainDaoSetup: pluginRepo=${pluginRepo}`)

  // ───────────────── PSP prepare + apply CrossChainController ─────────────────
  const minFailedMessageGas = 100_000n
  // (executor, guardian, minFailedMessageGas) — zero executor auto-deploys an owned one.
  const installData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256'],
    [ethers.ZeroAddress, ethers.ZeroAddress, minFailedMessageGas],
  )
  const { plugin: controller, helpers } = await pspInstall(
    psp,
    dao,
    { versionTag: { release: 1, build: 1 }, pluginSetupRepo: pluginRepo },
    installData,
  )
  const executor = helpers[0]
  logger.info(`CrossChainDaoSetup: controller=${controller} executor=${executor}`)

  // ───────────────── Loopback lane (chain 1 -> chain 1) ─────────────────
  const router = await (
    await new ethers.ContractFactory(
      CCIPRelayRouterMockArtifact.abi,
      CCIPRelayRouterMockArtifact.bytecode,
      deployer,
    ).deploy(ETH_CHAIN_SELECTOR)
  ).waitForDeployment()
  const routerAddress = await router.getAddress()
  await (await (router as any).setPeer(ETH_CHAIN_SELECTOR, routerAddress)).wait()
  await (await (router as any).setFee(0)).wait()

  const adapter = await (
    await new ethers.ContractFactory(CCIPAdapterArtifact.abi, CCIPAdapterArtifact.bytecode, deployer).deploy(
      controller,
      routerAddress,
      ethers.ZeroAddress,
      [{ standardChainId: CHAIN_ID, trustedRemote: controller }],
    )
  ).waitForDeployment()
  const adapterAddress = await adapter.getAddress()

  // ───────────────── Configuration events, post-install ─────────────────
  const controllerInterface = new ethers.Interface(CONTROLLER_ABI)
  await adminExecute([
    {
      to: controller,
      value: 0n,
      data: controllerInterface.encodeFunctionData('updateConfig', [
        [CHAIN_ID],
        [{ localAdapter: adapterAddress, remoteAdapter: adapterAddress }],
      ]),
    },
    {
      to: controller,
      value: 0n,
      data: controllerInterface.encodeFunctionData('updateExecutor', [executor]),
    },
    {
      to: controller,
      value: 0n,
      data: controllerInterface.encodeFunctionData('updateMinFailedMessageGas', [minFailedMessageGas]),
    },
  ])

  // ───────────────── forwardMessage proposal ─────────────────
  const erc20Interface = new ethers.Interface(ERC20_TRANSFER_ABI)
  const innerTransferTarget = ethers.Wallet.createRandom().address
  const message = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(address to, uint256 value, bytes data)[]'],
    [
      [
        {
          to: innerTransferTarget,
          value: 0n,
          data: erc20Interface.encodeFunctionData('transfer', [wallet.address, 1000n]),
        },
      ],
    ],
  )

  const forwardReceipt = await adminExecute([
    {
      to: controller,
      value: 0n,
      data: controllerInterface.encodeFunctionData('forwardMessage', [CHAIN_ID, 300_000n, message]),
    },
  ])

  // ───────────────── ExecuteSelectorCondition ─────────────────
  const condition = await (
    await new ethers.ContractFactory(
      ExecuteSelectorConditionArtifact.abi,
      ExecuteSelectorConditionArtifact.bytecode,
      deployer,
    ).deploy(dao, [])
  ).waitForDeployment()
  const conditionAddress = await condition.getAddress()
  const conditionInterface = new ethers.Interface(ExecuteSelectorConditionArtifact.abi)

  // Granting the controller EXECUTE on the DAO WITH the condition is what links
  // `plugin.conditionAddress`, keying the condition's selector events to the plugin.
  const EXECUTE_PERMISSION_ID = ethers.id('EXECUTE_PERMISSION')
  const MANAGE_SELECTORS_PERMISSION_ID = ethers.id('MANAGE_SELECTORS_PERMISSION')
  await adminExecute([
    {
      to: dao,
      value: 0n,
      data: daoContract.interface.encodeFunctionData('grantWithCondition', [
        dao,
        controller,
        EXECUTE_PERMISSION_ID,
        conditionAddress,
      ]),
    },
    {
      to: dao,
      value: 0n,
      data: daoContract.interface.encodeFunctionData('grant', [conditionAddress, dao, MANAGE_SELECTORS_PERMISSION_ID]),
    },
  ])

  const selectorTarget = ethers.Wallet.createRandom().address
  const allowedSelector = '0xa9059cbb' // transfer(address,uint256)
  const disallowedSelector = '0x23b872dd' // transferFrom(address,address,uint256) — allowed, then disallowed

  await adminExecute([
    {
      to: conditionAddress,
      value: 0n,
      data: conditionInterface.encodeFunctionData('allowSelectors', [
        { where: selectorTarget, selectors: [allowedSelector, disallowedSelector] },
      ]),
    },
  ])
  await adminExecute([
    {
      to: conditionAddress,
      value: 0n,
      data: conditionInterface.encodeFunctionData('disallowSelectors', [
        { where: selectorTarget, selectors: [disallowedSelector] },
      ]),
    },
  ])

  await mine(2, 1)

  return {
    dao,
    adminPlugin,
    controller,
    executor,
    adapter: adapterAddress,
    router: routerAddress,
    pluginRepo,
    deployer: wallet.address,
    minFailedMessageGas: minFailedMessageGas.toString(),
    forwardMessageTxHash: forwardReceipt.hash,
    innerTransferTarget,
    selectorCondition: conditionAddress,
    selectorTarget,
    allowedSelector,
    disallowedSelector,
  }
}
