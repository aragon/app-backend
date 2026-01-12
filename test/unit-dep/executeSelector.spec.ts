import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import { LogSelectorPermission } from '@plugins/logSelectorPermission'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integ: ExecuteSelector', function() {
  this.timeout(100000000)
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
    return await LibUtils.parseLogsByConfig(receipt.logs as any, network)
  }

  describe('complete executeSelector flow', () => {
    it('should check if the plugin condition address is set', async () => {
      const txHashes = [
        '0x5a059dc68ba109df5c3cc255380da4ad9d4d09f508093fff2196580bca50ebbb',
        '0xed76d8b9455f9f90a569fa2b58a7d892c3e2432b3d6a3a93cefaa1748be4a58a',
        '0x0589fe34ef257def2a736d8d8ef67892c84ae2ddfd6982a75c30c1885df703cc',
        '0xe42751f6ed5ca8bf0af5acdfb257a41f15fbb1638bbe88e42e62af90d7a14ce9',
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
      const conditionAddress = '0x99c15471aB696Ad3a96fbD76d5d9Fe04A85cf20a'
      expect(pluginWithCondition.conditionAddress).to.be.eq(conditionAddress)

      const addEthSelectorTxs = await getParsedLogs(
        '0xe42751f6ed5ca8bf0af5acdfb257a41f15fbb1638bbe88e42e62af90d7a14ce9',
      )

      for (const event of addEthSelectorTxs) {
        await event.handler(event.event, event.info)
      }

      const selectorOnDb = await Models.SelectorPermission.find({
        network,
        pluginAddress: pluginWithCondition.address,
        daoAddress: pluginWithCondition.daoAddress,
        conditionAddress: pluginWithCondition.conditionAddress,
      })

      expect(selectorOnDb).to.be.an('array')
      expect(selectorOnDb.length).to.be.eq(1)
      expect(selectorOnDb[0]).to.exist
      expect(selectorOnDb[0].selector).to.be.null // ETH transfer selector is null
      expect(selectorOnDb[0].isAllowed).to.be.true
      expect(selectorOnDb[0].disallowed.status).to.be.false

      const passingEthTransferTxs = await Promise.all([
        '0x1c3d30eb863dd78be00b560987b7da40523573553e0bdc6b9e7328d5965b139b',
        '0x188768b36fff427ec3105627150143cfedd0c78540f14f8fd9bf5c089ec14ed6',
        '0x7c8dc5de5b64fd79e87679c616a560b1203b176a9a64caa282cabc6d353bd797',
      ])

      for (const txHash of passingEthTransferTxs) {
        const events = await getParsedLogs(txHash)
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const proposals = await Models.Proposal.find({
        transactionHash: '0x1c3d30eb863dd78be00b560987b7da40523573553e0bdc6b9e7328d5965b139b',
        network,
        daoAddress: pluginWithCondition.daoAddress,
        pluginAddress: pluginWithCondition.address,
      })

      expect(proposals.length).to.be.eq(1)
      expect(proposals[0].executed.status).to.be.true

      const sigSelectorAddingTxs = '0x0f3788862eefb8d0a3857eb2ad21b2b77fa5299c22454a67a88ec79340488047'
      const addSelectorSigEvents = await getParsedLogs(sigSelectorAddingTxs)

      for (const event of addSelectorSigEvents) {
        await event.handler(event.event, event.info)
      }

      const sigSelectorOnDb = await Models.SelectorPermission.find({
        network,
        pluginAddress: pluginWithCondition.address,
        daoAddress: pluginWithCondition.daoAddress,
        conditionAddress: pluginWithCondition.conditionAddress,
        selector: null,
      })

      expect(sigSelectorOnDb.length).to.be.eq(1)
      expect(sigSelectorOnDb[0].isAllowed).to.be.false
      expect(sigSelectorOnDb[0].disallowed.status).to.be.true
      expect(sigSelectorOnDb[0].selector).to.be.eq(null)
    })
    it('should handle general selector indexing', async () => {
      const txHashes = [
        '0x5a059dc68ba109df5c3cc255380da4ad9d4d09f508093fff2196580bca50ebbb',
        '0xed76d8b9455f9f90a569fa2b58a7d892c3e2432b3d6a3a93cefaa1748be4a58a',
        '0x0589fe34ef257def2a736d8d8ef67892c84ae2ddfd6982a75c30c1885df703cc',
        '0xe42751f6ed5ca8bf0af5acdfb257a41f15fbb1638bbe88e42e62af90d7a14ce9',
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
        conditionAddress: '0x99c15471aB696Ad3a96fbD76d5d9Fe04A85cf20a',
      })

      expect(plugins).to.be.an('array')
      const pluginWithCondition = plugins.find(p => p.conditionAddress)
      expect(pluginWithCondition).to.exist

      await LogSelectorPermission.start(pluginWithCondition)

      const selectors = await Models.SelectorPermission.find({
        network: NetworksEnum.ethereumSepolia,
      })

      expect(selectors).to.be.an('array')
      expect(selectors.length).to.be.eq(1)

      expect(selectors[0].selector).to.be.eq(null)
      expect(selectors[0].isAllowed).to.be.false
      expect(selectors[0].disallowed.status).to.be.true
    })
  })
})
