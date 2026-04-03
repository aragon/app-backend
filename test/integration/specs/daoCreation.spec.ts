import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { prepareAndRunForge } from '../helpers/forge'

const NETWORK = NetworksEnum.ethereumMainnet

describe('DAO Creation', () => {
  before(async () => {
    await prepareAndRunForge('DaoSetup.s.sol')
  })

  it('indexes a DAO', async () => {
    const dao = await Models.Dao.findOne({ network: NETWORK })
    expect(dao).to.exist
    expect(dao!.network).to.equal(NETWORK)
  })

  it('indexes the admin plugin as installed', async () => {
    const dao = await Models.Dao.findOne({ network: NETWORK })
    expect(dao).to.exist
    const plugin = await Models.Plugin.findOne({ daoAddress: dao!.address, network: NETWORK })
    expect(plugin).to.exist
    expect(plugin!.status).to.equal('installed')
  })

  it('indexes InstallationApplied log', async () => {
    const dao = await Models.Dao.findOne({ network: NETWORK })
    expect(dao).to.exist
    const log = await Models.LogPluginSetupProcessor.findOne({
      daoAddress: dao!.address,
      network: NETWORK,
      event: 'InstallationApplied',
    })
    expect(log).to.exist
  })
})
