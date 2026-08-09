import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import CrossChainGasCacheModule from '@modules/crossChainGas/gasCache'
import { ICrossChainGasStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: crossChainGas/gasCache', () => {
  let sandbox: SinonSandbox
  let loggerError: sinon.SinonStub
  let loggerWarn: sinon.SinonStub

  const now = Date.UTC(2026, 7, 9, 12, 0, 0)
  const network = NetworksEnum.ethereumMainnet
  const controller = '0x1111111111111111111111111111111111111111'

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
    loggerWarn = sandbox.stub(logger, 'warn')
    sandbox.stub(config.CROSS_CHAIN_GAS, 'BUDGET_PER_CONTROLLER_PER_HOUR').value(2)
    sandbox.stub(config.CROSS_CHAIN_GAS, 'BUDGET_GLOBAL_PER_HOUR').value(3)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('consumeSimulationBudget', () => {
    it('Should allow when both buckets still have room', async () => {
      expect(await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)).to.equal(true)
      expect(await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)).to.equal(true)
    })

    it('Should refuse when the controller bucket is finished', async () => {
      await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)
      await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)

      expect(await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)).to.equal(false)
      expect(loggerWarn.calledOnceWith('Cross-chain gas: controller hourly budget exhausted' as any)).to.be.true
    })

    it('Should not count the global bucket when the controller is already refused', async () => {
      await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)
      await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)
      await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)

      const globalDoc = await Models.CrossChainGasCache.findOne({ id: Models.CrossChainGasCache.globalBudgetId(now) })

      // The two allowed requests counted it. The third one was refused before reaching it.
      expect(globalDoc?.count).to.equal(2)
    })

    it('Should refuse when the global bucket is finished even if the controller has room', async () => {
      const others = [
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
        '0x4444444444444444444444444444444444444444',
        '0x5555555555555555555555555555555555555555',
      ]

      const results: boolean[] = []
      for (const address of others) {
        results.push(await CrossChainGasCacheModule.consumeSimulationBudget(network, address, now))
      }

      // The global limit is 3, and each controller used only 1 of its own 2.
      expect(results).to.deep.equal([true, true, true, false])
      expect(loggerWarn.calledOnceWith('Cross-chain gas: global hourly budget exhausted' as any)).to.be.true
    })

    it('Should allow the simulation when the budget check itself throws', async () => {
      sandbox.stub(Models.CrossChainGasCache, 'consumeBudget').rejects(new Error('mongo down'))

      expect(await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, now)).to.equal(true)
      expect(loggerError.calledOnceWith('Cross-chain gas: budget check failed, allowing the simulation' as any)).to.be
        .true
    })
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
      sandbox.stub(Models.CrossChainGasCache, 'readEstimate').rejects(new Error('mongo down'))

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

      const doc = await Models.CrossChainGasCache.findOne({ id: key })

      expect(doc!.expiresAt!.getTime()).to.equal(now + 60_000)
      expect(doc!.purgeAt.getTime()).to.equal(now + 60_000 + 600_000)
    })

    it('Should not throw when the write fails', async () => {
      sandbox.stub(Models.CrossChainGasCache, 'writeEstimate').rejects(new Error('mongo down'))

      await CrossChainGasCacheModule.writeSharedEstimate(key, estimate as any, now)

      expect(loggerError.calledOnceWith('Cross-chain gas: shared cache write failed' as any)).to.be.true
    })
  })
})
