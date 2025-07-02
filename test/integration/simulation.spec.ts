import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { Models } from '@dbModels'
import logger from '@logger'
import Dao from '@models/schema/dao'
import Plugin from '@models/schema/plugin'
import Member from '@models/schema/member'

describe('Simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should test', async () => {
    const daoAddress = '0x8a77f7Dc00168B162dc558659121aA31878B949F'
    const tokenAddress = '0xA15C3b8b5D43E8EFa529eb0fE873A229424f311F'
    const network = NetworksEnum.chilizMainnet

    const txHashes = [
      '0x5e45339481b42299ed84bca76545bfd3748614da69708d3621c0519a850c19c4', //createDaoTxHash
      '0x66af2dab0dd4135e262675ddba71de4a48bf965b2c27f19221c6021000fef665', //pluginInstallationTxHashPrepare & proposal admin
      '0x34771a12dde0a84be07a1bbef860a8caaee8b141c5b9a0aec5b536f0da55fb33', //pluginInstallationTxHashApplied & proposal admin
      '0xf8d82988c91f1a92d6d5ecc1fb29853a685efe8b7257e4f8d316f7f18a1e34af', //proposal spp & proposal multiSig
      '0x02d5e3c344bf1b8be708a5f5fe0b72f860523abae85bdcb62d32cdd26778ee66', //proposal token-voting
    ]

    let dbDao: Dao | null = null
    let dbPlugins: Plugin[] | null = null
    let memberCreator: Member | null = null

    for (const txHash of txHashes) {
      const txReceipts = await Web3Helper.getTransactionReceipt(txHash, network)
      const logsDaoInstall = await UnitDepUtils.parseLogsByConfig(txReceipts?.logs! as any, network)

      for (const ev of logsDaoInstall) {
        await ev.handler(ev.event, ev.info)

        logger.info('Event processed', {
          event: ev.event.fragment.name,
          handler: ev.handler.name,
          info: ev.info,
          network: network,
        })

        if (ev.event.fragment.name === 'DAORegistered') {
          dbDao = await Models.Dao.findByAddress(daoAddress, network)
          expect(dbDao).to.exist
          expect(dbDao?.ens).to.be.null
          expect(dbDao?.metadataIpfs.startsWith('ipfs://')).to.be.true
          expect(dbDao?.avatar.startsWith('ipfs://')).to.be.true
          expect(dbDao?.metrics?.tvlUSD).to.eq(0)
          expect(dbDao?.metrics?.proposalsCreated).to.eq(0)
          expect(dbDao?.metrics?.proposalsExecuted).to.eq(0)
          expect(dbDao?.metrics?.uniqueVoters).to.eq(0)
          expect(dbDao?.metrics?.votes).to.eq(0)
          expect(dbDao?.metrics?.members).to.eq(0)

          logger.verbose('DAO exists', { id: dbDao?.id })
        }
      }
    }

    // expect all plugins to be installed
    dbPlugins = await Models.Plugin.find({
      daoAddress,
      network,
    })!
    expect(dbPlugins).to.have.lengthOf(4)

    // check admin plugin
    const adminPlugin = dbPlugins?.find((plugin: any) => plugin.interfaceType === IPluginInterfaceType.admin)
    expect(adminPlugin).to.be.exist
    expect(adminPlugin?.isSupported).to.be.true
    expect(adminPlugin?.status).to.eq(IPluginStatus.installed)
    expect(adminPlugin?.isProcess).to.be.true
    expect(adminPlugin?.isBody).to.be.true
    expect(adminPlugin?.isSubPlugin).to.be.false

    // check spp plugin
    const sppPlugin = dbPlugins?.find((plugin: any) => plugin.interfaceType === IPluginInterfaceType.spp)
    expect(sppPlugin).to.be.exist
    expect(sppPlugin?.isSupported).to.be.true
    expect(sppPlugin?.status).to.eq(IPluginStatus.installed)
    expect(sppPlugin?.processKey).to.exist
    expect(sppPlugin?.isProcess).to.be.true
    expect(sppPlugin?.isBody).to.be.false
    expect(sppPlugin?.isSubPlugin).to.be.false
    expect(sppPlugin?.subPlugins.length).to.eq(2)

    // check multisig plugin
    const multisigPlugin = dbPlugins?.find((plugin: any) => plugin.interfaceType === IPluginInterfaceType.multisig)
    expect(multisigPlugin).to.be.exist
    expect(multisigPlugin?.isSupported).to.be.true
    expect(multisigPlugin?.status).to.eq(IPluginStatus.installed)
    expect(multisigPlugin?.processKey).to.be.null
    expect(multisigPlugin?.isProcess).to.be.true
    expect(multisigPlugin?.isBody).to.be.true
    expect(multisigPlugin?.isSubPlugin).to.be.true
    expect(multisigPlugin?.parentPlugin).to.eq(sppPlugin?.address)
    expect(multisigPlugin?.stageIndex).to.eq(0)

    // check tokenVoting plugin
    const tokenVotingPlugin = dbPlugins?.find(
      (plugin: any) => plugin.interfaceType === IPluginInterfaceType.tokenVoting,
    )
    expect(tokenVotingPlugin).to.be.exist
    expect(tokenVotingPlugin?.isSupported).to.be.true
    expect(tokenVotingPlugin?.status).to.eq(IPluginStatus.installed)
    expect(tokenVotingPlugin?.processKey).to.be.null
    expect(tokenVotingPlugin?.tokenAddress).to.eq(tokenAddress)
    expect(tokenVotingPlugin?.isProcess).to.be.true
    expect(tokenVotingPlugin?.isBody).to.be.true
    expect(tokenVotingPlugin?.isSubPlugin).to.be.true
    expect(tokenVotingPlugin?.parentPlugin).to.eq(sppPlugin?.address)
    expect(tokenVotingPlugin?.stageIndex).to.eq(1)

    // check pluginSlugs created for each plugin
    const pluginSlugs = await Models.PluginSlug.find({ daoAddress, network })
    expect(pluginSlugs).to.have.lengthOf(4)

    // check daos members
    dbDao = await dbDao?.reload()
    expect(dbDao?.metrics?.members).to.eq(1)

    memberCreator = await Models.Member.findByAddress(dbDao?.creatorAddress)
    expect(memberCreator).to.exist

    // TODO:
    // after admin plugin installation we should have 1 member and dao metrics updated
    // settings for each plugin and that plugin isSupported should be set to true
    // token voting plugin should have tokenAddress set
    // token should be saved in the database + rateUsd + holders + totalSupply should be set
    // token plugin to be sync, members to be updated + metrics to be updated
    // dao member mapping to be created for the admin member
    // we should have proposal created for the admin and other plugins
  })
})
