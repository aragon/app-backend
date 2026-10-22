import baseSepoliaContracts from '../../config/contracts/baseSepolia.json'
import bnbTestnetContracts from '../../config/contracts/bnbTestnet.json'
import ethereumHoodiContracts from '../../config/contracts/ethereumHoodi.json'
import { Models } from '@dbModels'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import logger from '@logger'
import MongoDB from '@modules/mongo'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { type HexAddress, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integration: Zama testnet explorers (Etherscan V2)', () => {
  let dropStub: sinon.SinonStub
  let sandbox: sinon.SinonSandbox

  before(() => {
    dropStub = sinon.stub(MongoDB, 'drop').resolves()
  })

  after(() => {
    dropStub?.restore()
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  for (const network of [
    NetworksEnum.ethereumHoodi,
    NetworksEnum.polygonAmoy,
    NetworksEnum.baseSepolia,
    NetworksEnum.bnbTestnet,
  ]) {
    it(`resolves a recent block on ${network}`, async function () {
      this.timeout(30_000)

      const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3
      const block = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ETHERSCAN, timestamp, network, 'before')

      expect(block).to.be.a('number').and.greaterThan(0)
    })
  }

  const expectedMembers = [
    '0x87D9dDfFB87eA907D41a2193bAEd00896d3661A2',
    '0x3ffe3F16d47A54b1C6A3f47c9E6Ff5C2C1B32859',
    '0xFAd4c099d4236ea0D0654cb59322aF54766D0f64',
    '0xDF62645A2C714FebBF6060d1FB607E7EcceF0659',
    '0xd953216D672218db55cAb06c2406D5f8af89D720',
  ]

  for (const { network, contracts } of [
    { network: NetworksEnum.bnbTestnet, contracts: bnbTestnetContracts },
    { network: NetworksEnum.ethereumHoodi, contracts: ethereumHoodiContracts },
    { network: NetworksEnum.baseSepolia, contracts: baseSepoliaContracts },
  ]) {
    it(`syncs the management DAO and its multisig members on ${network}`, async function () {
      this.timeout(900_000)

      const { address: daoAddress, blockNumber: fromBlock } = contracts['v1.4.0'].ManagementDAOProxy
      const multisigAddress = contracts['v1.4.0'].ManagementDAOMultisig.address

      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'debug')

      const libUtils = new LibUtils({ daoAddress: daoAddress as HexAddress, network, config: { sandbox } })
      await libUtils.syncCompleteDao(fromBlock)

      const dao = await Models.Dao.findOne({ address: daoAddress, network })
      expect(dao).to.exist

      const multisig = await Models.Plugin.findOne({
        address: multisigAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
      })
      expect(multisig).to.exist

      const members = await Models.PluginMember.find({ daoAddress, pluginAddress: multisigAddress, network })
      expect(members.map(member => member.memberAddress)).to.have.members(expectedMembers)
    })
  }
})
