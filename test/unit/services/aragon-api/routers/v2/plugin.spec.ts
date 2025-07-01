import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PluginRouter from '@api/routers/v2/plugins'
import PluginController from '@api/controllers/plugins'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('RouterV2: Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getInstallationData', () => {
    it('should call controller with correct args and return installation data', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet
      const installationData = '{"plugin":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}'

      const controllerStub = sandbox.stub(PluginController, 'getInstallationData').resolves(installationData)

      const ctx: any = {
        query: { network, pluginAddress },
      }

      await PluginRouter.getInstallationData(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith({
          pluginAddress: getAddress(pluginAddress),
          network,
        }),
      ).to.be.true

      expect(ctx.body).to.equal(installationData)
    })

    it('should handle lowercase address and checksum it', async () => {
      const pluginAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' // lowercase
      const checksummedAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet
      const installationData = '{"plugin":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}'

      const controllerStub = sandbox.stub(PluginController, 'getInstallationData').resolves(installationData)

      const ctx: any = {
        query: { network, pluginAddress },
      }

      await PluginRouter.getInstallationData(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith({
          pluginAddress: checksummedAddress,
          network,
        }),
      ).to.be.true

      expect(ctx.body).to.equal(installationData)
    })

    it('should handle null response from controller', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet

      const controllerStub = sandbox.stub(PluginController, 'getInstallationData').resolves(null)

      const ctx: any = {
        query: { pluginAddress, network },
      }

      await PluginRouter.getInstallationData(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(ctx.body).to.be.null
    })

    it('should handle undefined response from controller', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet

      const controllerStub = sandbox.stub(PluginController, 'getInstallationData').resolves(undefined)

      const ctx: any = {
        query: { pluginAddress, network },
      }

      await PluginRouter.getInstallationData(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(ctx.body).to.be.undefined
    })

    it('should fail validation when pluginAddress is missing', async () => {
      const network = NetworksEnum.ethereumMainnet

      const ctx: any = {
        query: { network },
      }

      let error: any
      try {
        await PluginRouter.getInstallationData(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is required')
    })

    it('should fail validation when network is missing', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

      const ctx: any = {
        query: { pluginAddress },
      }

      let error: any
      try {
        await PluginRouter.getInstallationData(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network" is required')
    })

    it('should fail validation when pluginAddress is invalid', async () => {
      const pluginAddress = '0xinvalid'
      const network = NetworksEnum.ethereumMainnet

      const ctx: any = {
        query: { pluginAddress, network },
      }

      let error: any
      try {
        await PluginRouter.getInstallationData(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is not a valid address')
    })

    it('should fail validation when network is invalid', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = 'invalid-network'

      const ctx: any = {
        query: { pluginAddress, network },
      }

      let error: any
      try {
        await PluginRouter.getInstallationData(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network"')
    })

    it('should fail validation when extra parameters are provided', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet

      const ctx: any = {
        query: {
          pluginAddress,
          network,
          extraParam: 'should-not-be-allowed',
          anotherParam: 123,
        },
      }

      let error: any
      try {
        await PluginRouter.getInstallationData(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      // The error should be about invalid/extra parameters
      expect(error.exposeMeta.validationError.errors[0]).to.include('"value" must have less than or equal to 0 keys')
    })

    it('should handle different network values', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.arbitrumMainnet, NetworksEnum.baseMainnet]

      const controllerStub = sandbox.stub(PluginController, 'getInstallationData')

      for (const network of networks) {
        controllerStub.reset()
        controllerStub.resolves(`data-for-${network}`)

        const ctx: any = {
          query: { pluginAddress, network },
        }

        await PluginRouter.getInstallationData(ctx)

        expect(controllerStub.calledOnce).to.be.true
        expect(
          controllerStub.calledWith({
            pluginAddress: getAddress(pluginAddress),
            network,
          }),
        ).to.be.true
        expect(ctx.body).to.equal(`data-for-${network}`)
      }
    })

    it('should handle complex installation data response', async () => {
      const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet
      const complexData = {
        plugin: pluginAddress,
        metadata: {
          name: 'Test Plugin',
          version: '1.0.0',
          permissions: ['READ', 'WRITE'],
        },
        installationSteps: [
          { step: 1, action: 'approve' },
          { step: 2, action: 'install' },
        ],
      }

      const controllerStub = sandbox.stub(PluginController, 'getInstallationData').resolves(complexData)

      const ctx: any = {
        query: { network, pluginAddress },
      }

      await PluginRouter.getInstallationData(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(ctx.body).to.deep.equal(complexData)
    })
  })
})
