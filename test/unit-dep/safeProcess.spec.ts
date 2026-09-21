import { Models } from '@dbModels'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { type HexAddress, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

/**
 * A Safe becomes a process of a DAO by being granted `EXECUTE_PERMISSION` on it, and by nothing
 * else - no setup processor, no installation, no prior knowledge of the Safe.
 *
 * So this syncs the DAO over the block range that contains both its registration and the grant, and
 * lets the real handlers run over the real logs. Nothing about the Safe is set up: if it ends up in
 * `Plugin`, the permission event is what put it there.
 */
describe('Integ: Safe as a process — mainnet', () => {
  const network = NetworksEnum.ethereumMainnet
  const daoAddress = '0x9332620B88A26e0e6e0E0e83CC9C7474ea61A62C' as HexAddress
  const safeAddress = '0x27CE7C8c1675c3b57046Cf56d96061693B6123e8' as HexAddress

  /**
   * The DAO is registered here, and grants the Safe execute permission 13 blocks later. The range
   * ends on the grant itself rather than leaving a margin: there is nothing after it worth reading,
   * and a `toBlock` past the head is rejected outright.
   */
  const deploymentBlock = 26022876
  const blockLimit = 26022889

  let sandbox: SinonSandbox

  afterEach(() => {
    sandbox?.restore()
  })

  it('discovers the Safe from the permission grant and gives it a plugin row', async function () {
    this.timeout(900_000)

    sandbox = sinon.createSandbox()
    const libUtils = new LibUtils({ daoAddress, network, config: { sandbox, blockLimit } })

    // Stops the replay the moment the Safe turns up. Everything the handler does - the row, the
    // slug, the owner seed - happens before it returns, so there is nothing left to wait for.
    await libUtils.syncCompleteDao(
      deploymentBlock - 1,
      async () => (await Models.Plugin.exists({ address: safeAddress, daoAddress, network })) != null,
    )

    const dao = await Models.Dao.findOne({ address: daoAddress, network }).lean()
    expect(dao, 'DAO not indexed').to.exist
    expect(dao!.blockNumber).to.equal(deploymentBlock)

    const safe = await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()

    expect(safe, 'the Safe was not registered as a process').to.exist
    expect(safe!.interfaceType).to.equal(IPluginInterfaceType.safe)
    expect(safe!.status).to.equal(IPluginStatus.installed)
    expect(safe!.isProcess).to.be.true
    // A body lives in `Setting`, never in `Plugin`. This row describes the process role only.
    expect(safe!.isBody).to.be.false

    // Without a slug the process has no address the app can route to.
    const slug = await Models.PluginSlug.findOne({ pluginAddress: safeAddress, daoAddress, network }).lean()
    expect(slug, 'the Safe process got no slug').to.exist

    // Owner events only carry changes, so the owners the Safe already had have to come from the
    // seed that registration triggers - otherwise the DAO has a process with no members at all.
    const owners = await Models.SafeMember.find({ network, safeAddress }).lean()
    expect(owners.length, 'the existing owners were never seeded').to.be.greaterThan(0)
  })
})
