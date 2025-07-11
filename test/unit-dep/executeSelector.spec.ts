import sinon from 'sinon'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { NetworksEnum, IPluginStatus } from '@types'
import logger from '@logger'
import configIndexer from '@indexer/configIndexer'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { PluginHandler } from '@handlers/pluginHandler'
import RabbitMQ from "@modules/rabbitMQ";
import AragonPlugins from "@plugins/index";
import {LogSelectorPermission} from "@plugins/logSelectorPermission";

describe.skip('ExecuteSelector: Integration Test', () => {
  let sandbox: sinon.SinonSandbox
  let network = NetworksEnum.ethereumSepolia

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox.restore()
  })

  async function getParsedLogs(txHash: string) {
    const receipt = await Web3Helper.getTransactionReceipt(txHash, network)
    if (!receipt) return false
    return await UnitDepUtils.parseLogsByConfig(receipt.logs as any, network)
  }

  describe('complete executeSelector flow', () => {
    it('should check if the plugin condition address is set', async () => {
      const txHashes = [
        '0x5a059dc68ba109df5c3cc255380da4ad9d4d09f508093fff2196580bca50ebbb',
        '0xbf9e3ac7a9aff1248ac333b18035eed748e19f5a8ed86ca5587429cdb545d8d4',
        '0x9ef64afa23ef2ced4dbfec481c31dd7a17441fc6b6c586d14104a10e59342966',
      ]

      const allEvents = (
        await Promise.all(
          txHashes.map(async txHash => {
            return await getParsedLogs(txHash)
          }),
        )
      ).filter(Boolean)

      for (const events of allEvents) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const plugins = await Models.Plugin.find({
        network: NetworksEnum.ethereumSepolia,
      })
      expect(plugins).to.be.an('array')
      const pluginWithCondition = plugins.find(p => p.conditionAddress)
      expect(pluginWithCondition).to.exist
      const conditionAddress = '0xDA894f03e043D56022B49D9eef1FD55388cBe55C'
      expect(pluginWithCondition.conditionAddress).to.be.eq(conditionAddress)

      const ethTransferFailingTxs = await Promise.all([
        getParsedLogs('0xb9f8f18a597e683ba8c38473d3a7f5df2860a807197b9242c1afadc3aa72ed1d'),
        getParsedLogs('0xf89589fc50f3683ec4a612e20acadd4ef4ba3cf0a8941008a30330c085848fc8'),
        getParsedLogs('0xf53daeb76b0a7a18321977bb54fff1c65fa36620289b20aa363771aac673d5ef')
      ])

      for(const events of ethTransferFailingTxs) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const proposal = await Models.Proposal.findOne({
        pluginAddress: pluginWithCondition.address,
      })
      expect(proposal).to.exist
      expect(proposal.executed.status).to.be.false

      const addEthSelectorTxs = await getParsedLogs('0xa590321e653fc15f6b6226e0118ef9c3c7433c5f9387ee0bd5d86b690dc35747')

      for(const event of addEthSelectorTxs) {
        await event.handler(event.event, event.info)
      }

      const selectorOnDb = await Models.SelectorPermission.findOne({
        network,
        pluginAddress: pluginWithCondition.address,
        daoAddress: pluginWithCondition.daoAddress,
        conditionAddress: pluginWithCondition.conditionAddress,
      })

      expect(selectorOnDb).to.exist
      expect(selectorOnDb.selector).to.be.null // ETH transfer selector is null
      expect(selectorOnDb.isAllowed).to.be.true
      expect(selectorOnDb.disallowed.status).to.be.false

      const passingEthTransferTxs = await Promise.all([
        '0xec10897d68997d8012801bbd57c4d340bf807ac697ca31108e5dd57ee9674c9d',
        '0xe18775668e684b818e7d6e84edfb4a6c9f64c576a5ef45e4caf3c23803f3e414',
        '0xee90c9daa24908bcd3d31933aecfbbdcf4dd31cf2abeebb21247ab39d4980f29'
      ])

      for(const txHash of passingEthTransferTxs) {
        const events = await getParsedLogs(txHash)
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const proposals = await Models.Proposal.find({
        network,
        daoAddress: pluginWithCondition.daoAddress,
        pluginAddress: pluginWithCondition.address,
      })

      expect(proposals.length).to.be.eq(2)
      expect(proposals[1].executed.status).to.be.true

      const someSigFailingTxs = await Promise.all([
        getParsedLogs('0x3ba16cecfcb80b3bd579de36a8315f985e929bfeb1df920dd11a7033fed43cec'),
        getParsedLogs('0x7aadd9307601dec0f185631cf92cdc7c9e23c8edd06d2cb169b7726813477417'),
        getParsedLogs('0xce611c42b7574de30b728e8af1d4407a9bca2aee96dce752439b59a646888dcd')
      ])

      for(const events of someSigFailingTxs) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const sigProposal = await Models.Proposal.findOne({
        pluginAddress: pluginWithCondition.address,
        network,
        blockNumber: someSigFailingTxs[0][0].info.blockNumber,
      })

      expect(sigProposal).to.exist
      expect(sigProposal.executed.status).to.be.false

      const sigSelectorAddingTxs = '0x0789678f30d1c913ffe58534e3723d2a65133850207989a9bdabd3f81d31ec71'
      const addSelectorSigEvents = await getParsedLogs(sigSelectorAddingTxs)

      for(const event of addSelectorSigEvents) {
        await event.handler(event.event, event.info)
      }

      const sigSelectorOnDb = await Models.SelectorPermission.find({
        network,
        pluginAddress: pluginWithCondition.address,
        daoAddress: pluginWithCondition.daoAddress,
        conditionAddress: pluginWithCondition.conditionAddress,
        selector: {$ne: null}
      })

      expect(sigSelectorOnDb.length).to.be.eq(1)
      expect(sigSelectorOnDb[0].isAllowed).to.be.true
      expect(sigSelectorOnDb[0].disallowed.status).to.be.false
      expect(sigSelectorOnDb[0].selector).to.be.eq('0xee57e36f')

      const customSigPassingTxs = await Promise.all([
        getParsedLogs('0x03cb8ac08c0433a26a552b14e984780f25a4493e4df95d77b8eecb43dee396c3'),
        getParsedLogs('0xc9adf484060fcd99d7d1b9bb8735d55cdadb5a83d3e10220c787ac6d641dcf5c'),
        getParsedLogs('0xaabbdc8433bfb28844d8bf296975b66f0b985754c8c09a3da72f196ad4716307')
      ])

      for(const events of customSigPassingTxs) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const proposalAfterCustomSig = await Models.Proposal.findOne({
        transactionHash: '0x03cb8ac08c0433a26a552b14e984780f25a4493e4df95d77b8eecb43dee396c3'
      })

      expect(proposalAfterCustomSig).to.exist
      expect(proposalAfterCustomSig.executed.status).to.be.true
      expect(proposalAfterCustomSig.rawActions[0].data.startsWith('0xee57e36f')).to.be.true

      const disallowEthSelectorTx = await getParsedLogs(
        '0xf5fd216c8399eb98862896ddb845e6643089cd4085446c2723869e7679f59233'
      )

      for(const event of disallowEthSelectorTx) {
        await event.handler(event.event, event.info)
      }

      const disallowedEthSelector = await Models.SelectorPermission.findOne({
        network,
        pluginAddress: pluginWithCondition.address,
        daoAddress: pluginWithCondition.daoAddress,
        conditionAddress: pluginWithCondition.conditionAddress,
        selector: null, // ETH transfer selector is null
      })

      expect(disallowedEthSelector).to.exist
      expect(disallowedEthSelector.isAllowed).to.be.false
      expect(disallowedEthSelector.disallowed.status).to.be.true

      const attemptAfterDisallowingEthTransfer = await Promise.all([
        getParsedLogs('0x7d846bb2e9de15aec102b45bc73d53bc04f6fe0f65e3a54d49932fd6ee6e1da0'),
        getParsedLogs('0xb03092ed408a9b9178efc4ceb949e97d3f34f242af5967aedc17e70238c7117b'),
        getParsedLogs('0xd2773e8869299ad02f54b8f88c8544623c7d08775ed6828cc579cfa5ffab5264')
      ])

      for(const events of attemptAfterDisallowingEthTransfer) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const proposalAfterDisallowingEthTransfer = await Models.Proposal.findOne({
        transactionHash: '0x7d846bb2e9de15aec102b45bc73d53bc04f6fe0f65e3a54d49932fd6ee6e1da0',
        pluginAddress: pluginWithCondition.address,
      })

      expect(proposalAfterDisallowingEthTransfer).to.exist
      expect(proposalAfterDisallowingEthTransfer.executed.status).to.be.false


      const disallowSelectorSigTx = await getParsedLogs(
        '0xc715e4321bb54ca6f9411414da5cb4dd02e48803d4f00f858a0f1276217bdecf'
      )

      for(const event of disallowSelectorSigTx) {
        await event.handler(event.event, event.info)
      }

      const disallowedSigSelector = await Models.SelectorPermission.findOne({
        network,
        pluginAddress: pluginWithCondition.address,
        daoAddress: pluginWithCondition.daoAddress,
        conditionAddress: pluginWithCondition.conditionAddress,
        selector: '0xee57e36f', // custom sig selector
      })

      expect(disallowedSigSelector).to.exist
      expect(disallowedSigSelector.isAllowed).to.be.false
      expect(disallowedSigSelector.disallowed.status).to.be.true

      const attemptAfterDisallowingSigSelector = await Promise.all([
        getParsedLogs('0xd65daa7b31ee460485643695aba10bd785f04abb8189f661cff3ea3ac6c3bb36'),
        getParsedLogs('0xda00df91b91e34451c80fe84ef53d314f9bee16290623194e63f7e6ddb864084'),
        getParsedLogs('0x9591d716fff2c65c8e48cbdddab0d5faa2cf8797bc68bb4b8f094fe10b867ee7')
      ])

      for(const events of attemptAfterDisallowingSigSelector) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const proposalAfterDisallowingSigSelector = await Models.Proposal.findOne({
        transactionHash: '0xd65daa7b31ee460485643695aba10bd785f04abb8189f661cff3ea3ac6c3bb36'
      })

      expect(proposalAfterDisallowingSigSelector).to.exist
      expect(proposalAfterDisallowingSigSelector.executed.status).to.be.false
    })
    it('should handle general selector indexing', async () => {
      const txHashes = [
        '0x5a059dc68ba109df5c3cc255380da4ad9d4d09f508093fff2196580bca50ebbb',
        '0xbf9e3ac7a9aff1248ac333b18035eed748e19f5a8ed86ca5587429cdb545d8d4',
        '0x9ef64afa23ef2ced4dbfec481c31dd7a17441fc6b6c586d14104a10e59342966',
      ]

      const allEvents = (
        await Promise.all(
          txHashes.map(async txHash => {
            return await getParsedLogs(txHash)
          }),
        )
      ).filter(Boolean)

      for (const events of allEvents) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const plugins = await Models.Plugin.find({
        network: NetworksEnum.ethereumSepolia,
        conditionAddress: '0xDA894f03e043D56022B49D9eef1FD55388cBe55C',
      })

      expect(plugins).to.be.an('array')
      const pluginWithCondition = plugins.find(p => p.conditionAddress)
      expect(pluginWithCondition).to.exist

      await LogSelectorPermission.start(pluginWithCondition)

      const selectors = await Models.SelectorPermission.find({
        network: NetworksEnum.ethereumSepolia,
      })

      expect(selectors).to.be.an('array')
      expect(selectors.length).to.be.eq(2)

      expect(selectors[0].selector).to.be.eq('0xee57e36f')
      expect(selectors[0].isAllowed).to.be.false
      expect(selectors[0].disallowed.status).to.be.true

      expect(selectors[1].selector).to.be.eq(null)
      expect(selectors[1].isAllowed).to.be.false
      expect(selectors[1].disallowed.status).to.be.true
    })
  })
})
