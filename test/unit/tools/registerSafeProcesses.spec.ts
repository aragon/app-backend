import { Models } from '@dbModels'
import ContractHelper from '@helpers/contractHelper'
import PluginDetector from '@helpers/pluginDetector'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { BaseGovernance } from '@src/governance'
import { IPermission } from '@src/types/permission'
import { EnumQueueName, IEventLogPermission, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import RegisterSafeProcesses from '@tools/registerSafeProcesses'
import { expect } from 'chai'
import { ethers, getAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const DAO = getAddress('0x665928feacc8739116a3f2ef66a9c61936348dc2')
const SAFE = getAddress('0x8442c05d620e11009bdaeddefda3b5303725c39a')
const OWNER_A = getAddress('0x5043b9fe61961a46be7f2930452d0833103f0ca1')
const OWNER_B = getAddress('0x251db905400412a538072563212b4ae7e23f96b8')
const CONDITION = getAddress('0x1234567890abcdef1234567890abcdef12345678')
const PERMISSION_ID = ethers.id(IPermission.EXECUTE_PERMISSION)
const SAFE_PROXY_CODE = `0x${PluginDetector._generateFunctionHash(PluginDetector.SAFE_WALLET).slice(2)}`

const grant = ({
  blockNumber,
  transactionHash,
  event = IEventLogPermission.Granted,
  daoAddress = DAO.toLowerCase(),
  whereAddress = DAO,
  whoAddress = SAFE.toLowerCase(),
  conditionAddress,
}: {
  blockNumber: number
  transactionHash: string
  event?: IEventLogPermission
  daoAddress?: string
  whereAddress?: string
  whoAddress?: string
  conditionAddress?: string
}) =>
  Models.DaoPermission.create({
    network: NETWORK,
    blockNumber,
    transactionHash,
    transactionIndex: 0,
    logIndex: blockNumber,
    daoAddress,
    permissionId: PERMISSION_ID,
    whoAddress,
    whereAddress,
    conditionAddress,
    event,
  })

const seedDao = () =>
  Models.Dao.create({
    network: NETWORK,
    address: DAO,
    creatorAddress: OWNER_A,
    transactionHash: '0xdao',
    blockNumber: 1,
    isActive: true,
  })

describe('Tool: RegisterSafeProcesses', () => {
  let sandbox: SinonSandbox
  const previousExecute = process.env.EXECUTE
  const previousTargetNetwork = process.env.TARGET_NETWORK

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'warn')
    sandbox.stub(ContractHelper, 'getBytecode').resolves(SAFE_PROXY_CODE)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1_700_000_000)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER_A.toLowerCase(), OWNER_B.toLowerCase()])
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves(null)
    delete process.env.TARGET_NETWORK
  })

  afterEach(() => {
    sandbox.restore()
    if (previousExecute === undefined) delete process.env.EXECUTE
    else process.env.EXECUTE = previousExecute
    if (previousTargetNetwork === undefined) delete process.env.TARGET_NETWORK
    else process.env.TARGET_NETWORK = previousTargetNetwork
  })

  it('does not write during a dry run', async () => {
    await seedDao()
    await grant({ blockNumber: 1, transactionHash: '0xgrant-dry-run' })
    process.env.EXECUTE = 'false'

    await RegisterSafeProcesses.start()

    expect(await Models.Plugin.countDocuments()).to.equal(0)
    expect(await Models.PluginSlug.countDocuments()).to.equal(0)
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('applies a canonical association, repairs a partial owner index, and is idempotent on rerun', async () => {
    await seedDao()
    await grant({ blockNumber: 1, transactionHash: '0xgrant-apply' })
    await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER_A })
    process.env.EXECUTE = 'true'

    await RegisterSafeProcesses.start()

    expect(
      await Models.Plugin.countDocuments({
        network: NETWORK,
        address: SAFE,
        daoAddress: DAO,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
      }),
    ).to.equal(1)
    expect(await Models.PluginSlug.countDocuments({ network: NETWORK, pluginAddress: SAFE, daoAddress: DAO })).to.equal(
      1,
    )
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members([
      OWNER_A,
      OWNER_B,
    ])

    await RegisterSafeProcesses.start()

    expect(await Models.Plugin.countDocuments({ network: NETWORK, address: SAFE, daoAddress: DAO })).to.equal(1)
    expect(await Models.PluginSlug.countDocuments({ network: NETWORK, pluginAddress: SAFE, daoAddress: DAO })).to.equal(
      1,
    )
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
  })

  it('canonicalizes and replays a held grant condition', async () => {
    await seedDao()
    await grant({
      blockNumber: 1,
      transactionHash: '0xgrant-conditioned',
      conditionAddress: CONDITION.toLowerCase(),
    })
    process.env.EXECUTE = 'true'

    await RegisterSafeProcesses.start()

    const plugin = await Models.Plugin.findOne({ network: NETWORK, address: SAFE, daoAddress: DAO }).lean()
    expect(plugin?.conditionAddress).to.equal(CONDITION)
    expect(
      (RabbitMQHelper.sendMessage as sinon.SinonStub).calledWith(
        EnumQueueName.logSelectorPermission,
        sinon.match({
          params: sinon.match({ address: SAFE, daoAddress: DAO, conditionAddress: CONDITION }),
        }),
      ),
    ).to.be.true
  })

  it('counts invalid persisted addresses and continues with valid grants', async () => {
    await seedDao()
    await grant({
      blockNumber: 1,
      transactionHash: '0xgrant-invalid',
      whoAddress: 'not-an-address',
    })
    await grant({ blockNumber: 2, transactionHash: '0xgrant-valid' })
    process.env.EXECUTE = 'true'

    await RegisterSafeProcesses.start()

    expect(await Models.Plugin.countDocuments({ network: NETWORK, daoAddress: DAO, address: SAFE })).to.equal(1)
    expect((logger.error as sinon.SinonStub).calledWith('RegisterSafeProcesses grant address normalization failed')).to
      .be.true
  })

  it('groups DAO and Safe addresses case-insensitively before selecting the latest grant', async () => {
    await seedDao()
    await grant({
      blockNumber: 1,
      transactionHash: '0xgrant-case-insensitive',
      daoAddress: DAO.toLowerCase(),
      whereAddress: DAO,
      whoAddress: SAFE.toLowerCase(),
    })
    await grant({
      blockNumber: 2,
      transactionHash: '0xrevoke-case-insensitive',
      event: IEventLogPermission.Revoked,
      daoAddress: DAO,
      whereAddress: DAO.toLowerCase(),
      whoAddress: SAFE,
    })
    process.env.EXECUTE = 'true'

    await RegisterSafeProcesses.start()

    expect(await Models.Plugin.countDocuments()).to.equal(0)
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })
})
