import { expect } from 'chai'
import { Models } from '@dbModels'
import SimulationController from '@api/controllers/simulation'
import { NetworksEnum, ISimulationStatus } from '@types'
import * as sinon from 'sinon'
import { ethers } from 'ethers'
import config from '@config'
import logger from '@logger'

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
      const daoAddress = '0x5dEA8E499b05de8F86E7521F039770268055b23F'
      const pluginAddress = '0xA303C435563a4544a84E26501F4666346Ff73a0d'

      const actions = [
        {
          to: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
          data: '0x9281aa0b000000000000000000000000654ab1708158ccc539a67ea9ea39ec30e10496ac0000000000000000000000000000000000000000000000000000000000000001',
          value: '0',
        },
      ]

      pluginFindStub.resolves({
        address: pluginAddress,
        daoAddress: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        status: 'installed',
        isSupported: true,
        permissions: [],
      })

      const result = await SimulationController.simulate(pluginAddress, actions, NetworksEnum.ethereumMainnet)

      expect(result.status).to.be.not.undefined
      expect(result.url.startsWith(config.TENDERLY.SHARING_BASE_URL)).to.be.true
      expect(result.runAt).to.be.not.undefined
      expect(result.network).to.equal(NetworksEnum.ethereumMainnet)
      logger.info(`Simulation URL: ${result.url}`)
    })
  })
})
