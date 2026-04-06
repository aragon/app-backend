import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { prepareWithDaoReplay } from '../helpers/forge'

const NETWORK = NetworksEnum.ethereumMainnet
const DAO_ADDRESS = '0xf204245b0B05E9A0780761E326552A569c1D6ceb'

describe('DAO Replay', function () {
  this.timeout(300_000)
  this.slow(0)

  before(async () => {
    await prepareWithDaoReplay(DAO_ADDRESS, NETWORK)
  })

  it('indexes the DAO', async () => {
    const dao = await Models.Dao.findOne({ address: DAO_ADDRESS, network: NETWORK })
    expect(dao).to.exist
    expect(dao!.network).to.equal(NETWORK)
  })

  it('indexes plugins as installed', async () => {
    const plugins = await Models.Plugin.find({ daoAddress: DAO_ADDRESS, network: NETWORK })
    expect(plugins).to.have.length.greaterThan(0)
    expect(plugins.some(p => p.status === 'installed')).to.be.true
  })

  it('indexes InstallationApplied logs', async () => {
    const logs = await Models.LogPluginSetupProcessor.find({
      daoAddress: DAO_ADDRESS,
      network: NETWORK,
      event: 'InstallationApplied',
    })
    expect(logs).to.have.length.greaterThan(0)
  })
})
