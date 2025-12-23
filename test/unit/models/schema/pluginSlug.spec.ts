import { Models } from '@dbModels'
import { IPluginSlug, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: PluginSlug', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create PluginSlug', async () => {
    const createdSlug = await Models.PluginSlug.create({
      pluginAddress: '0xPlugin',
      daoAddress: '0xDao',
      network: NetworksEnum.ethereumMainnet,
      slug: IPluginSlug.multisig,
    })

    expect(createdSlug.network).to.eq(NetworksEnum.ethereumMainnet)
    expect(createdSlug.daoAddress).to.eq('0xDao')
    expect(createdSlug.pluginAddress).to.eq('0xPlugin')
    expect(createdSlug.slug).to.eq(IPluginSlug.multisig)
  })

  it('Should findExistingSlugInDao', async () => {
    const createdSlug = await Models.PluginSlug.create({
      pluginAddress: '0xPlugin',
      daoAddress: '0xDao',
      network: NetworksEnum.ethereumMainnet,
      slug: IPluginSlug.multisig,
    })

    const pluginSlug = await Models.PluginSlug.findExistingSlugInDao(
      createdSlug.daoAddress,
      createdSlug.slug,
      createdSlug.network,
    )
    expect(pluginSlug?.slug).to.eq(IPluginSlug.multisig)
  })

  it('Should update PluginSlug', async () => {
    const createdSlug = await Models.PluginSlug.create({
      pluginAddress: '0xPlugin',
      daoAddress: '0xDao',
      network: NetworksEnum.ethereumMainnet,
      slug: IPluginSlug.multisig,
    })

    await createdSlug.update({
      pluginAddress: '0xPlugin1',
    })

    expect(createdSlug.pluginAddress).to.eq('0xPlugin1')
  })

  it('Should reload', async () => {
    const createdSlug = await Models.PluginSlug.create({
      pluginAddress: '0xPlugin',
      daoAddress: '0xDao',
      network: NetworksEnum.ethereumMainnet,
      slug: IPluginSlug.multisig,
    })
    await createdSlug.reload()

    expect(createdSlug.slug).to.eq(createdSlug.slug)
  })
})
