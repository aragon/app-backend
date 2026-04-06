import { Models } from '@dbModels'
import { IPluginInterfaceType } from '@src/types/plugin'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { prepareAndRunForge } from '../helpers/forge'

const NETWORK = NetworksEnum.ethereumMainnet

describe('Multisig Plugin', function () {
  this.timeout(300_000)
  this.slow(0)
  let dao: any

  before(async () => {
    await prepareAndRunForge('MultisigSetup.s.sol')
    dao = await Models.Dao.findOne({ network: NETWORK })
  })

  it('indexes a DAO', async () => {
    expect(dao).to.exist
    expect(dao!.network).to.equal(NETWORK)
  })

  it('indexes the multisig plugin as installed with correct interfaceType', async () => {
    const plugin = await Models.Plugin.findOne({
      network: NETWORK,
      interfaceType: IPluginInterfaceType.multisig,
      daoAddress: dao.address,
    })
    expect(plugin).to.exist
    expect(plugin!.interfaceType).to.equal(IPluginInterfaceType.multisig)
    expect(plugin!.status).to.equal('installed')
  })

  it('indexes multisig members', async () => {
    const plugin = await Models.Plugin.findOne({
      network: NETWORK,
      interfaceType: IPluginInterfaceType.multisig,
      daoAddress: dao.address,
    })
    expect(plugin).to.exist
  })

  it('indexes MultisigSettingsUpdated', async () => {
    const plugin = await Models.Plugin.findOne({
      network: NETWORK,
      interfaceType: IPluginInterfaceType.multisig,
      daoAddress: dao.address,
    })
    expect(plugin).to.exist
    const setting = await Models.Setting.findOne({ pluginAddress: plugin!.address, network: NETWORK })
    expect(setting).to.exist
    expect(setting!.onlyListed).to.equal(true)
    expect(setting!.minApprovals).to.equal(1)
  })
})
