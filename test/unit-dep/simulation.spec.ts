import { expect } from 'chai'
import { Models } from '@dbModels'
import SimulationController from '@api/controllers/simulation'
import { NetworksEnum, ISimulationStatus } from '@types'
import * as sinon from 'sinon'
import { DAO } from '@artifacts/dao'
import { ethers, Interface } from 'ethers'
describe.only('SimulationController', () => {
  let daoFindStub: sinon.SinonStub
  let pluginFindStub: sinon.SinonStub

  beforeEach(() => {
    daoFindStub = sinon.stub(Models.Dao, 'findOne')
    pluginFindStub = sinon.stub(Models.Plugin, 'findOne')
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('simulateBundle', () => {
    it('should simulate valid actions successfully', async function () {
      this.timeout(1600000)
      const daoAddress = '0x5afEb7F3259A25EB21287e3A917BeE3d4dE58dAf'
      const pluginAddress = '0x18371E70D7c0cD13E4fD1356d3140B35301455d0'

      const rawTxData = [
        {
          to: '0x333A4823466879eeF910A04D473505da62142069',
          data: '0x095ea7b3000000000000000000000000ba12222222228d8ba445958a75a0704d566bf2c8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          value: '0',
        },
      ]

      const actions = rawTxData.map(tx => {
        return {
          to: tx.to,
          data: tx.data,
          value: 0,
        }
      })

      const iFace = new Interface(DAO.abi)
      const data = iFace.encodeFunctionData('execute', [ethers.id(Date.now().toString()), actions, 0])

      const mockActions = {
        from: pluginAddress,
        to: daoAddress,
        data: data,
        value: '0',
      }

      daoFindStub.returns({
        lean: sinon
          .stub()
          .resolves([{ address: '0x5afEb7F3259A25EB21287e3A917BeE3d4dE58dAf', network: NetworksEnum.ethereumMainnet }]),
      })

      pluginFindStub.returns({
        lean: sinon
          .stub()
          .resolves([{ address: '0x18371E70D7c0cD13E4fD1356d3140B35301455d0', network: NetworksEnum.ethereumMainnet }]),
      })

      const result = await SimulationController.simulate(mockActions, NetworksEnum.ethereumMainnet)

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://tdly.co/test')
      expect(result.network).to.equal(NetworksEnum.ethereumMainnet)
    })
  })
})
