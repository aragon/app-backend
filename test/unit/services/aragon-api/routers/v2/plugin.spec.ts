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
        controllerStub.calledWith(
          sinon.match({
            pluginAddress: getAddress(pluginAddress),
            network,
          }),
        ),
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
        controllerStub.calledWith(
          sinon.match({
            pluginAddress: checksummedAddress,
            network,
          }),
        ),
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
          controllerStub.calledWith(
            sinon.match({
              pluginAddress: getAddress(pluginAddress),
              network,
            }),
          ),
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

  describe('getPluginsByDao', () => {
    it('should call controller with correct args and return plugins for a DAO with default parameters', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = [
        { address: '0xPlugin1', interfaceType: 'tokenVoting', status: 'installed' },
        { address: '0xPlugin2', interfaceType: 'multisig', status: 'installed' },
      ]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            status: 'all',
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should handle lowercase dao address and checksum it', async () => {
      const daoAddress = '0xe2e445489b0356d3087eff7e79db7ff3f16c4fea' // lowercase
      const checksummedAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = []

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: checksummedAddress,
            network,
            status: 'all',
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should filter plugins by interfaceType', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const interfaceType = 'tokenVoting' as const
      const mockPlugins = [{ address: '0xPlugin1', interfaceType: 'tokenVoting', status: 'installed' }]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { interfaceType },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            interfaceType,
            status: 'all',
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should filter plugins by status', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const status = 'installed' as const
      const mockPlugins = [{ address: '0xPlugin1', status: 'installed' }]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { status },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            status,
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should filter plugins by isProcess', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = [{ address: '0xPlugin1', isProcess: true }]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { isProcess: 'true' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            isProcess: true,
            status: 'all',
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should filter plugins by isSupported', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = [{ address: '0xPlugin1', isSupported: true }]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { isSupported: 'true' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            isSupported: true,
            status: 'all',
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should handle isProcess=false boolean parsing', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = []

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { isProcess: 'false' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            isProcess: false,
            status: 'all',
          }),
        ),
      ).to.be.true
    })

    it('should handle isSupported=false boolean parsing', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = []

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { isSupported: 'false' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            isSupported: false,
            status: 'all',
          }),
        ),
      ).to.be.true
    })

    it('should combine multiple filters', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const interfaceType = 'multisig' as const
      const status = 'installed' as const
      const mockPlugins = [{ address: '0xPlugin1', interfaceType: 'multisig', status: 'installed' }]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: {
          interfaceType,
          status,
          isSupported: 'true',
          isProcess: 'false',
        },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            interfaceType,
            status,
            isSupported: true,
            isProcess: false,
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should handle empty plugin list returned', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves([])

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(ctx.body).to.deep.equal([])
    })

    it('should handle null response from controller', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(null)

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(ctx.body).to.be.null
    })

    it('should handle undefined response from controller', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(undefined)

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(ctx.body).to.be.undefined
    })

    it('should fail validation when daoAddress is missing', async () => {
      const network = NetworksEnum.polygonMainnet

      const ctx: any = {
        params: { network },
        query: {},
      }

      let error: any
      try {
        await PluginRouter.getPluginsByDao(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"daoAddress" is required')
    })

    it('should fail validation when network is missing', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'

      const ctx: any = {
        params: { daoAddress },
        query: {},
      }

      let error: any
      try {
        await PluginRouter.getPluginsByDao(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network" is required')
    })

    it('should fail validation when daoAddress is invalid', async () => {
      const daoAddress = '0xinvalid'
      const network = NetworksEnum.polygonMainnet

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      let error: any
      try {
        await PluginRouter.getPluginsByDao(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"daoAddress" is not a valid address')
    })

    it('should fail validation when network is invalid', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = 'invalid-network'

      const ctx: any = {
        params: { daoAddress, network },
        query: {},
      }

      let error: any
      try {
        await PluginRouter.getPluginsByDao(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network"')
    })

    it('should fail validation when interfaceType is invalid', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet

      const ctx: any = {
        params: { daoAddress, network },
        query: { interfaceType: 'invalid-interface-type' },
      }

      let error: any
      try {
        await PluginRouter.getPluginsByDao(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      // Validation reports "value" in the error for extra params
      expect(error.exposeMeta.validationError.errors[0]).to.match(/"(interfaceType|value)"/)
    })

    it('should fail validation when status is invalid', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet

      const ctx: any = {
        params: { daoAddress, network },
        query: { status: 'invalid-status' },
      }

      let error: any
      try {
        await PluginRouter.getPluginsByDao(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"status"')
    })

    it('should handle invalid isProcess value as undefined', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = []

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { isProcess: 'not-a-boolean' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      // parseBoolean returns undefined for invalid values, so it won't be in the call
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            status: 'all',
          }),
        ),
      ).to.be.true
      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should handle invalid isSupported value as undefined', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = []

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { isSupported: 'not-a-boolean' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      // parseBoolean returns undefined for invalid values, so it won't be in the call
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            status: 'all',
          }),
        ),
      ).to.be.true
      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should handle different network values', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const networks = [NetworksEnum.ethereumMainnet, NetworksEnum.arbitrumMainnet, NetworksEnum.baseMainnet]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao')

      for (const network of networks) {
        controllerStub.reset()
        controllerStub.resolves([{ network }])

        const ctx: any = {
          params: { daoAddress, network },
          query: {},
        }

        await PluginRouter.getPluginsByDao(ctx)

        expect(controllerStub.calledOnce).to.be.true
        expect(
          controllerStub.calledWith(
            sinon.match({
              daoAddress: getAddress(daoAddress),
              network,
              status: 'all',
            }),
          ),
        ).to.be.true
        expect(ctx.body).to.deep.equal([{ network }])
      }
    })

    it('should handle status="all" explicitly', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const mockPlugins = [
        { address: '0xPlugin1', status: 'installed' },
        { address: '0xPlugin2', status: 'uninstalled' },
      ]

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao').resolves(mockPlugins)

      const ctx: any = {
        params: { daoAddress, network },
        query: { status: 'all' },
      }

      await PluginRouter.getPluginsByDao(ctx)

      expect(controllerStub.calledOnce).to.be.true
      expect(
        controllerStub.calledWith(
          sinon.match({
            daoAddress: getAddress(daoAddress),
            network,
            status: 'all',
          }),
        ),
      ).to.be.true

      expect(ctx.body).to.deep.equal(mockPlugins)
    })

    it('should handle all valid interfaceType values', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const interfaceTypes = [
        'tokenVoting',
        'multisig',
        'admin',
        'spp',
        'gauge',
        'unknown',
        'lockToVote',
        'capitalDistributor',
      ] as const

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao')

      for (const interfaceType of interfaceTypes) {
        controllerStub.reset()
        controllerStub.resolves([{ interfaceType }])

        const ctx: any = {
          params: { daoAddress, network },
          query: { interfaceType },
        }

        await PluginRouter.getPluginsByDao(ctx)

        expect(controllerStub.calledOnce).to.be.true
        expect(
          controllerStub.calledWith(
            sinon.match({
              daoAddress: getAddress(daoAddress),
              network,
              interfaceType,
              status: 'all',
            }),
          ),
        ).to.be.true
      }
    })

    it('should handle all valid status values', async () => {
      const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
      const network = NetworksEnum.polygonMainnet
      const statuses = ['preInstall', 'installed', 'deprecated', 'uninstalled', 'all'] as const

      const controllerStub = sandbox.stub(PluginController, 'getPluginsByDao')

      for (const status of statuses) {
        controllerStub.reset()
        controllerStub.resolves([{ status }])

        const ctx: any = {
          params: { daoAddress, network },
          query: { status },
        }

        await PluginRouter.getPluginsByDao(ctx)

        expect(controllerStub.calledOnce).to.be.true
        expect(
          controllerStub.calledWith(
            sinon.match({
              daoAddress: getAddress(daoAddress),
              network,
              status,
            }),
          ),
        ).to.be.true
      }
    })
  })
})
