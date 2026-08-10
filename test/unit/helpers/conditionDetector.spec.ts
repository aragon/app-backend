import { CrossChainExecuteSelectorCondition } from '@artifacts/CrossChainExecuteSelectorCondition'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import ConditionDetector from '@helpers/conditionDetector'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { IConditionInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: ConditionDetector', () => {
  let sandbox: SinonSandbox
  const testAddress = '0x3BCE21a6EFeF775960D121D3A1947b9CCc030B0F'
  const testNetwork = NetworksEnum.ethereumMainnet

  const plainTopic = new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorAllowed')!.topicHash.slice(2)
  const crossChainTopic = new Interface(CrossChainExecuteSelectorCondition.abi)
    .getEvent('SelectorAllowed')!
    .topicHash.slice(2)

  const stubGetCode = (result: Promise<string>) => {
    const getCodeStub = sandbox.stub().returns(result)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getCode: getCodeStub } as any)
    return getCodeStub
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('detect', () => {
    it('should detect an ExecuteSelectorCondition by its SelectorAllowed topic', async () => {
      const getCodeStub = stubGetCode(Promise.resolve(`0x6080604052${plainTopic}60805260`))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.equal(IConditionInterfaceType.executeSelector)
      expect(getCodeStub.calledOnceWith(testAddress)).to.be.true
    })

    it('should detect a CrossChainExecuteSelectorCondition by its SelectorAllowed topic', async () => {
      stubGetCode(Promise.resolve(`0x6080604052${crossChainTopic}60805260`))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.equal(IConditionInterfaceType.executeSelector)
    })

    it('should return null for bytecode of an unrelated contract', async () => {
      stubGetCode(Promise.resolve('0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe'))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null when the address has no code', async () => {
      stubGetCode(Promise.resolve('0x'))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null and warn when the provider fails', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      stubGetCode(Promise.reject(new Error('rpc down')))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Failed to detect condition interface type' as any)).to.be.true
    })
  })
})
