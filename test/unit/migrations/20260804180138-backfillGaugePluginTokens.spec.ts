import { Models } from '@dbModels'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import backfillGaugePluginTokensMigration from '@src/migrations/20260804180138-backfillGaugePluginTokens'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('migration: backfillGaugePluginTokens', () => {
  const network = NetworksEnum.ethereumMainnet

  let sandbox: SinonSandbox
  let saveAndGetTokenStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').callsFake(async (tokenAddress, net) => {
      await Models.Token.collection.insertOne({
        id: `${tokenAddress}-${net}`,
        address: tokenAddress,
        network: net,
        name: 'Backfilled',
        symbol: 'BF',
      })
      return (await Models.Token.collection.findOne({ address: tokenAddress, network: net })) as any
    })
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const seedPlugin = async (address: string, tokenAddress: string | null, interfaceType = IPluginInterfaceType.gauge) =>
    Models.Plugin.create({
      address,
      daoAddress: '0xabCDef1234567890abCdEF1234567890ABcDeF12',
      network,
      interfaceType,
      status: IPluginStatus.installed,
      tokenAddress,
      blockNumber: 1000,
      transactionHash: '0xabc123',
    })

  describe('start', () => {
    it('creates the missing token for a gauge plugin with a tokenAddress', async () => {
      const tokenAddress = '0xB000000000000000000000000000000000000001'
      await seedPlugin('0xA000000000000000000000000000000000000001', tokenAddress)

      await backfillGaugePluginTokensMigration.start()

      const token = await Models.Token.collection.findOne({ address: tokenAddress, network })
      expect(token).to.exist
      expect(saveAndGetTokenStub.calledOnceWith(tokenAddress, network)).to.be.true
    })

    it('skips gauge plugins whose token already exists', async () => {
      const tokenAddress = '0xB000000000000000000000000000000000000002'
      await seedPlugin('0xA000000000000000000000000000000000000002', tokenAddress)
      await Models.Token.collection.insertOne({
        id: `${tokenAddress}-${network}`,
        address: tokenAddress,
        network,
        name: 'Existing',
        symbol: 'EX',
      })

      await backfillGaugePluginTokensMigration.start()

      expect(saveAndGetTokenStub.called).to.be.false
      const tokens = await Models.Token.collection.find({ address: tokenAddress, network }).toArray()
      expect(tokens).to.have.lengthOf(1)
      expect(tokens[0].name).to.eq('Existing')
    })

    it('ignores non-gauge plugins and gauge plugins without a tokenAddress', async () => {
      await seedPlugin(
        '0xA000000000000000000000000000000000000003',
        '0xB000000000000000000000000000000000000003',
        IPluginInterfaceType.tokenVoting,
      )
      await seedPlugin('0xA000000000000000000000000000000000000004', null)

      await backfillGaugePluginTokensMigration.start()

      expect(saveAndGetTokenStub.called).to.be.false
      expect(await Models.Token.collection.countDocuments({})).to.eq(0)
    })

    it('deduplicates plugins sharing the same tokenAddress and network', async () => {
      const tokenAddress = '0xB000000000000000000000000000000000000005'
      await seedPlugin('0xA000000000000000000000000000000000000005', tokenAddress)
      await seedPlugin('0xA000000000000000000000000000000000000006', tokenAddress)

      await backfillGaugePluginTokensMigration.start()

      expect(saveAndGetTokenStub.calledOnce).to.be.true
      const tokens = await Models.Token.collection.find({ address: tokenAddress, network }).toArray()
      expect(tokens).to.have.lengthOf(1)
    })

    it('completes cleanly when there is nothing to migrate', async () => {
      await backfillGaugePluginTokensMigration.start()

      expect(saveAndGetTokenStub.called).to.be.false
    })

    it('logs error and rethrows when the plugin query fails', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'find').rejects(new Error('Database error'))

      await expect(backfillGaugePluginTokensMigration.start()).to.be.rejectedWith('Database error')
      const failedErrorCall = loggerErrorStub.getCalls().find(call => String(call.args[0]) === 'Migration failed')
      expect(failedErrorCall).to.exist
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await backfillGaugePluginTokensMigration.stop()
      expect(true).to.be.true
    })
  })
})
