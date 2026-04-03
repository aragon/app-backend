import { Models } from '@dbModels'
import { IPluginInterfaceType } from '@src/types/plugin'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { getWallet } from '../helpers/wallet'
import { prepareAndRunForge } from '../helpers/forge'

const NETWORK = NetworksEnum.ethereumMainnet

describe('Multisig Plugin', () => {
  before(async () => {
    await prepareAndRunForge('MultisigSetup.s.sol')
  })

  it('indexes a DAO', async () => {
    const dao = await Models.Dao.findOne({ network: NETWORK })
    expect(dao).to.exist
    expect(dao!.network).to.equal(NETWORK)
  })

  it('indexes the multisig plugin as installed with correct interfaceType', async () => {
    const plugin = await Models.Plugin.findOne({
      network: NETWORK,
      interfaceType: IPluginInterfaceType.multisig,
    })
    expect(plugin).to.exist
    expect(plugin!.interfaceType).to.equal(IPluginInterfaceType.multisig)
    expect(plugin!.status).to.equal('installed')
  })

  it('indexes multisig members', async () => {
    const plugin = await Models.Plugin.findOne({
      network: NETWORK,
      interfaceType: IPluginInterfaceType.multisig,
    })
    expect(plugin).to.exist
    const member = await Models.PluginMember.findOne({ pluginAddress: plugin!.address, network: NETWORK })
    expect(member).to.exist
    expect(member!.memberAddress.toLowerCase()).to.equal(getWallet().address.toLowerCase())
  })

  it('indexes MultisigSettingsUpdated', async () => {
    const plugin = await Models.Plugin.findOne({
      network: NETWORK,
      interfaceType: IPluginInterfaceType.multisig,
    })
    expect(plugin).to.exist
    const setting = await Models.Setting.findOne({ pluginAddress: plugin!.address, network: NETWORK })
    expect(setting).to.exist
    expect(setting!.onlyListed).to.equal(true)
    expect(setting!.minApprovals).to.equal(1)
  })
})
