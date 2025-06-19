import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PluginRouter from '@api/routers/v1/plugins'
import PluginController from '@api/controllers/plugins'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('Router: Plugin', () => {
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
  })
})
