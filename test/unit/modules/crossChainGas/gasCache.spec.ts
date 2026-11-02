import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import CrossChainGasCacheModule from '@modules/crossChainGas/gasCache'
import { ICrossChainGasStatus } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: crossChainGas/gasCache', () => {
  let sandbox: SinonSandbox
  let loggerError: sinon.SinonStub

  const now = Date.UTC(2026, 7, 9, 12, 0, 0)

  const estimate = {
    status: ICrossChainGasStatus.SUCCESS,
    requiredGas: '250000',
    runAt: now,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Every failure here is swallowed and only reported through the log, so the log line is the
    // observable behaviour and each test that hits one checks it.
    loggerError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('readSharedEstimate', () => {
    const key = 'ethereumMainnet|0x1111|8453|0xdeadbeef'

    it('Should return null when nothing is saved', async () => {
      expect(await CrossChainGasCacheModule.readSharedEstimate(key, now)).to.equal(null)
    })

    it('Should return the saved measurement', async () => {
      await CrossChainGasCacheModule.writeSharedEstimate(key, estimate as any, now)

      const stored = await CrossChainGasCacheModule.readSharedEstimate(key, now)

      expect(stored?.fresh).to.equal(true)
      expect(stored?.result.requiredGas).to.equal('250000')
    })

    it('Should return null when the read throws', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'readResult').rejects(new Error('mongo down'))

      expect(await CrossChainGasCacheModule.readSharedEstimate(key, now)).to.equal(null)
      expect(loggerError.calledOnceWith('Cross-chain gas: shared cache read failed' as any)).to.be.true
    })
  })

  describe('writeSharedEstimate', () => {
    const key = 'ethereumMainnet|0x1111|8453|0xcafe'

    it('Should use the ttl and the stale window from config', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'CACHE_TTL').value(60_000)
      sandbox.stub(config.CROSS_CHAIN_GAS, 'STALE_WINDOW').value(600_000)

      await CrossChainGasCacheModule.writeSharedEstimate(key, estimate as any, now)

      const doc = await Models.TenderlyCallCache.findOne({ id: key })

      expect(doc!.expiresAt!.getTime()).to.equal(now + 60_000)
      expect(doc!.purgeAt.getTime()).to.equal(now + 60_000 + 600_000)
    })

    it('Should not throw when the write fails', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'writeResult').rejects(new Error('mongo down'))

      await CrossChainGasCacheModule.writeSharedEstimate(key, estimate as any, now)

      expect(loggerError.calledOnceWith('Cross-chain gas: shared cache write failed' as any)).to.be.true
    })
  })
})
