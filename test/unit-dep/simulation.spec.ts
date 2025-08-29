import { expect } from 'chai'
import { Models } from '@dbModels'
import SimulationController from '@api/controllers/simulation'
import { NetworksEnum, ISimulationStatus } from '@types'
import * as sinon from 'sinon'
import { ethers } from 'ethers'

describe.only('SimulationController', () => {
  let pluginFindStub: sinon.SinonStub

  beforeEach(() => {
    pluginFindStub = sinon.stub(Models.Plugin, 'findOne')
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('simulate', () => {
    it('should simulate valid actions successfully', async function () {
      this.timeout(1600000)
      const daoAddress = '0x5afEb7F3259A25EB21287e3A917BeE3d4dE58dAf'
      const pluginAddress = '0x18371E70D7c0cD13E4fD1356d3140B35301455d0'

      const actions = [
        {
          from: pluginAddress,
          to: '0x333A4823466879eeF910A04D473505da62142069',
          data: '0x095ea7b3000000000000000000000000ba12222222228d8ba445958a75a0704d566bf2c8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          value: '0',
        },
        {
          from: pluginAddress,
          to: '0x333A4823466879eeF910A04D473505da62142069',
          data: '0x095ea7b3000000000000000000000000ba12222222228d8ba445958a75a0704d566bf2c8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          value: '0',
        },
      ]

      pluginFindStub.resolves({
        address: pluginAddress,
        daoAddress: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        status: 'installed',
        isSupported: true,
        permissions: [
          {
            permissionId: ethers.id('EXECUTE_PERMISSION'),
            whoAddress: pluginAddress,
            whereAddress: daoAddress,
          },
        ],
      })

      const result = await SimulationController.simulate(pluginAddress, actions, NetworksEnum.ethereumMainnet)

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.url.startsWith('https://tdly.co')).to.true
      expect(result.runAt).to.be.not.undefined
      expect(result.network).to.equal(NetworksEnum.ethereumMainnet)
    })
  })
})
