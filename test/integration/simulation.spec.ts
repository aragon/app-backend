import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { Models } from '@dbModels'
import logger from '@logger'

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
    const network = NetworksEnum.chilizMainnet

    const txHashes = [
      '0x5e45339481b42299ed84bca76545bfd3748614da69708d3621c0519a850c19c4', //createDaoTxHash
      '0x66af2dab0dd4135e262675ddba71de4a48bf965b2c27f19221c6021000fef665', //pluginInstallationTxHashPrepare & proposal admin
      '0x34771a12dde0a84be07a1bbef860a8caaee8b141c5b9a0aec5b536f0da55fb33', //pluginInstallationTxHashApplied & proposal admin
      '0xf8d82988c91f1a92d6d5ecc1fb29853a685efe8b7257e4f8d316f7f18a1e34af', //proposal spp & proposal multiSig
      '0x02d5e3c344bf1b8be708a5f5fe0b72f860523abae85bdcb62d32cdd26778ee66', //proposal token-voting
    ]

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
          const daoExists = await Models.Dao.findByAddress(daoAddress, network)
          expect(daoExists).to.exist
          expect(daoExists.ens).to.be.null
          expect(daoExists.metadataIpfs.startsWith('ipfs://')).to.be.true
          expect(daoExists.avatar.startsWith('ipfs://')).to.be.true
          expect(daoExists.metrics.tvlUSD).to.eq(0)
          expect(daoExists.metrics.proposalsCreated).to.eq(0)
          expect(daoExists.metrics.proposalsExecuted).to.eq(0)
          expect(daoExists.metrics.uniqueVoters).to.eq(0)
          expect(daoExists.metrics.votes).to.eq(0)
          expect(daoExists.metrics.members).to.eq(0)

          logger.info('DAO exists', { id: daoExists.id })
        }
      }

      if (txHash === '0x34771a12dde0a84be07a1bbef860a8caaee8b141c5b9a0aec5b536f0da55fb33') {
        const plugins = await Models.Plugin.find({
          daoAddress,
          network,
        })

        expect(plugins).to.have.lengthOf(4)
        const tokenVotingPlugin = plugins.find(
          (plugin: any) => plugin.interfaceType === IPluginInterfaceType.tokenVoting,
        )
        expect(tokenVotingPlugin).to.be.exist
        expect(tokenVotingPlugin?.tokenAddress).to.be.exist

        const daoAfterPluginInstalled = await Models.Dao.findByAddress(daoAddress, network)
        expect(daoAfterPluginInstalled.metrics.members).to.eq(1)
      }
    }
  })
})
