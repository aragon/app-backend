import { CrossChainExecuteSelectorCondition } from '@artifacts/CrossChainExecuteSelectorCondition'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import ConditionDetector from '@helpers/conditionDetector'
import ContractHelper from '@helpers/contractHelper'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { IConditionInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface, id } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: ConditionDetector', () => {
  let sandbox: SinonSandbox
  const testAddress = '0x3BCE21a6EFeF775960D121D3A1947b9CCc030B0F'
  const testNetwork = NetworksEnum.ethereumMainnet

  const topicsOf = (abi: any) => {
    const contractInterface = new Interface(abi)
    return {
      allowed: contractInterface.getEvent('SelectorAllowed')!.topicHash.slice(2),
      disallowed: contractInterface.getEvent('SelectorDisallowed')!.topicHash.slice(2),
    }
  }

  const plain = topicsOf(ExecuteSelectorCondition.abi)
  const crossChain = topicsOf(CrossChainExecuteSelectorCondition.abi)

  const supportsInterfaceResult = (supported: boolean) => AbiCoder.defaultAbiCoder().encode(['bool'], [supported])

  const stubProvider = (getCode: Promise<string | null>, call?: Promise<string>) => {
    const getCodeStub = sandbox.stub(ContractHelper, 'getBytecode').returns(getCode)
    const callStub = sandbox.stub().returns(call ?? Promise.resolve(supportsInterfaceResult(true)))
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ call: callStub } as any)
    return { getCodeStub, callStub }
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'verbose')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('detect', () => {
    it('should detect an ExecuteSelectorCondition that carries both topics and answers ERC-165', async () => {
      const { getCodeStub, callStub } = stubProvider(
        Promise.resolve(`0x6080604052${plain.allowed}608052${plain.disallowed}60`),
      )

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.equal(IConditionInterfaceType.executeSelector)
      expect(getCodeStub.calledOnceWith(testAddress, testNetwork)).to.be.true
      expect(callStub.calledOnce).to.be.true
    })

    it('should detect a CrossChainExecuteSelectorCondition that carries both topics and answers ERC-165', async () => {
      stubProvider(Promise.resolve(`0x6080604052${crossChain.allowed}608052${crossChain.disallowed}60`))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.equal(IConditionInterfaceType.executeSelector)
    })

    it('should detect an SPP rule condition through a Solady minimal proxy', async () => {
      const minimalProxyBytecode =
        '0x5f5f365f5f37365f73a9b55dc23f0bce067cd4ec02afe366336376b5dd5af43d5f5f3e6029573d5ffd5b3d5ff3'
      const implementationBytecode = `0x${[
        id('getRules()'),
        id('initialize(address,(uint8,uint8,uint240,bytes32)[])'),
        id('updateRules((uint8,uint8,uint240,bytes32)[])'),
      ]
        .map(selector => selector.slice(2, 10))
        .join('')}`
      const { getCodeStub } = stubProvider(
        Promise.resolve(minimalProxyBytecode),
        Promise.resolve(supportsInterfaceResult(true)),
      )
      getCodeStub.onSecondCall().resolves(implementationBytecode)

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.equal(IConditionInterfaceType.sppRule)
      expect(getCodeStub.secondCall.args[0]).to.equal('0xa9b55Dc23F0BCe067cd4ec02AFe366336376b5dD')
    })

    it('should return null for a contract that carries the topics but is not a permission condition', async () => {
      stubProvider(
        Promise.resolve(`0x6080604052${plain.allowed}608052${plain.disallowed}60`),
        Promise.resolve(supportsInterfaceResult(false)),
      )

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null when the ERC-165 call reverts', async () => {
      stubProvider(
        Promise.resolve(`0x6080604052${plain.allowed}608052${plain.disallowed}60`),
        Promise.reject(new Error('execution reverted')),
      )

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null when only one of the two topics is present', async () => {
      const { callStub } = stubProvider(Promise.resolve(`0x6080604052${plain.allowed}60805260`))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
      expect(callStub.called).to.be.false
    })

    it('should return null when the topics come from two different implementations', async () => {
      stubProvider(Promise.resolve(`0x6080604052${plain.allowed}608052${crossChain.disallowed}60`))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null for bytecode of an unrelated contract', async () => {
      stubProvider(
        Promise.resolve('0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe'),
        Promise.resolve(supportsInterfaceResult(false)),
      )

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null when the address has no code', async () => {
      stubProvider(Promise.resolve('0x'))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
    })

    it('should return null and warn when the provider fails', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      stubProvider(Promise.reject(new Error('rpc down')))

      const result = await ConditionDetector.detect(testAddress, testNetwork)

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Failed to detect condition interface type' as any)).to.be.true
    })
  })
})
