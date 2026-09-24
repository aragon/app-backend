import { Models } from '@dbModels'
import Queue from '@helpers/queue'
import { SafeGovernance } from '@src/governance'
import { type HexAddress, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const DAO = '0x665928FeacC8739116A3f2eF66a9c61936348DC2' as HexAddress
const OTHER_DAO = '0x00000000000000000000000000000000000000B0' as HexAddress
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A' as HexAddress
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1' as HexAddress

const grantProcess = (status = IPluginStatus.installed) =>
  Models.Plugin.create({
    address: SAFE,
    daoAddress: DAO,
    network: NETWORK,
    transactionHash: `0x${'1'.repeat(64)}`,
    blockNumber: 1,
    interfaceType: IPluginInterfaceType.safe,
    status,
    isSupported: true,
    isProcess: true,
  })

describe('Governance:SafeGovernance', () => {
  let sandbox: SinonSandbox
  const governance = new SafeGovernance(SAFE, NETWORK)

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    await Models.Member.create({ address: OWNER })
    await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
  })

  afterEach(() => sandbox.restore())

  it('lists the owners for a DAO the Safe reaches and refuses one it does not', async () => {
    await grantProcess()

    const page = await governance.findAndPaginateMembers({ extraParams: { daoAddress: DAO } })

    expect(page.data.map(row => row.address)).to.deep.equal([OWNER])
    await expect(governance.findAndPaginateMembers({ extraParams: { daoAddress: OTHER_DAO } })).to.be.rejectedWith(
      'notFound',
    )
  })

  it('finds an owner only while the Safe is tracked', async () => {
    expect(await governance.findOne(OWNER)).to.equal(null)

    await grantProcess()

    expect((await governance.findOne(OWNER))?.memberAddress).to.equal(OWNER)
  })

  it('refreshes the metrics of every DAO the Safe reaches and never writes owners itself', async () => {
    await grantProcess()
    const metrics = sandbox.stub(Queue, 'daoMetrics').resolves()

    await governance.updateDaoMetrics()

    expect(metrics.calledOnceWithExactly(DAO, NETWORK)).to.be.true
    await expect(governance.getOrCreate()).to.be.rejectedWith('syncOwners')
  })
})
