import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

/**
 * A sepolia dao whose token voting plugin was updated in place, so the address ends up with a
 * deprecated row and an installed row sharing one PluginSlug. Uninstalling the leftover row used to
 * take the slug the live row still needs, which is what APP-1163 reported.
 */
describe('Integ: Plugin update keeps its slug', () => {
  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0x275e7F783B82CFcF452EcE4Dc46CAEdC5b8030D0'
  const fromBlock = 8689561
  const toBlock = 9236357

  const updatedPlugin = '0xaA4E9E0D80cEfb27dB5114808E7182e9edAFd3DA'

  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should keep the slug when the row an update left behind is uninstalled', async function () {
    this.timeout(100000000)

    const libUtils = new LibUtils({
      daoAddress,
      network,
      config: { sandbox, blockLimit: toBlock },
    })
    await libUtils.syncCompleteDao(fromBlock)

    const where = { network, daoAddress, address: updatedPlugin }
    const deprecatedRow = await Models.Plugin.findOne({ ...where, status: IPluginStatus.deprecated })
    const installedRow = await Models.Plugin.findOne({ ...where, status: IPluginStatus.installed })
    expect(deprecatedRow).to.not.be.null
    expect(installedRow).to.not.be.null

    // the new row starts empty, so whatever named the slug has to come across from the old one
    expect(installedRow!.processKey).to.equal(deprecatedRow!.processKey)

    const slugBefore = await Models.PluginSlug.findPluginSlug(updatedPlugin, daoAddress, network)

    // the leftover row going away must not take the live row's slug with it
    const deleted = await PluginSlug.deleteSlug(deprecatedRow!)
    expect(deleted).to.be.false

    const slugAfter = await Models.PluginSlug.findPluginSlug(updatedPlugin, daoAddress, network)
    expect(slugAfter?.slug).to.equal(slugBefore?.slug)
  })
})
