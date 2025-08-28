import { expect } from 'chai'
import { Models } from '@dbModels'
import SimulationController from '@api/controllers/simulation'
import TenderlyModule from '@modules/tenderly'
import { NetworksEnum, SimulationStatus } from '@types'
import * as sinon from 'sinon'

describe.only('SimulationController', () => {
  let daoFindStub: sinon.SinonStub
  let pluginFindStub: sinon.SinonStub

  beforeEach(() => {
    daoFindStub = sinon.stub(Models.Dao, 'find')
    pluginFindStub = sinon.stub(Models.Plugin, 'find')
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('simulateBundle', () => {
    it('should simulate valid actions successfully', async function() {
      this.timeout(1600000)
      const daoAddress = '0x5afEb7F3259A25EB21287e3A917BeE3d4dE58dAf'
      const pluginAddress = '0x18371E70D7c0cD13E4fD1356d3140B35301455d0'

      const mockActions = [
        {
          from: pluginAddress,
          to: daoAddress,
          data: '0x',
          value: '0',
        },
      ]

      daoFindStub.returns({
        lean: sinon.stub().resolves([{ address: '0x5afEb7F3259A25EB21287e3A917BeE3d4dE58dAf' }]),
      })

      pluginFindStub.returns({
        lean: sinon.stub().resolves([{ address: '0x18371E70D7c0cD13E4fD1356d3140B35301455d0' }]),
      })

      const result = await SimulationController.simulateBundle(mockActions, NetworksEnum.ethereumMainnet)

      expect(result.status).to.equal(SimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://tdly.co/test')
      expect(result.network).to.equal(NetworksEnum.ethereumMainnet)
    })
  })
})
