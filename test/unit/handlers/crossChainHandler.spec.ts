import { Models } from '@dbModels'
import { CrossChainHandler } from '@handlers/crossChainHandler'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import type { SinonSandbox } from 'sinon'

const CONTROLLER = '0x1111111111111111111111111111111111111111'
const DAO = '0x2222222222222222222222222222222222222222'
const EXECUTOR = '0x3333333333333333333333333333333333333333'
const ADAPTER_LOCAL = '0x4444444444444444444444444444444444444444'
const ADAPTER_REMOTE = '0x5555555555555555555555555555555555555555'
const ZERO = '0x0000000000000000000000000000000000000000'

const info = {
  address: CONTROLLER,
  network: NetworksEnum.ethereumSepolia,
  transactionHash: '0xTxHash',
  blockNumber: 1000,
} as any

describe('Indexer: CrossChain Handler', () => {
  let sandbox: SinonSandbox

  const stubSetting = (sb: SinonSandbox, crossChain: any = {}) => {
    const setting = {
      daoAddress: DAO,
      pluginAddress: CONTROLLER,
      crossChain: {
        executor: null,
        executorIsDao: false,
        lanes: [],
        minFailedMessageGas: null,
        ...crossChain,
      },
      markModified: sb.stub(),
      save: sb.stub().resolves(),
    }

    sb.stub(Models.Plugin, 'findByAddress').resolves({
      address: CONTROLLER,
      daoAddress: DAO,
      network: NetworksEnum.ethereumSepolia,
      interfaceType: IPluginInterfaceType.crossChainController,
    } as any)
    sb.stub(Models.Setting, 'findActive').resolves(setting as any)

    return setting
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(CrossChainHandler, '_readFeeToken').resolves(null)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('configUpdated', () => {
    it('should add a lane keyed by the remote chain id', async () => {
      const setting = stubSetting(sandbox)

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(8453), localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE } } as any,
        info,
      )

      expect(setting.crossChain.lanes).to.deep.equal([
        { chainId: 8453, localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE, feeToken: null },
      ])
      expect(setting.save.calledOnce).to.equal(true)
    })

    it('should store the adapter fee token on the lane', async () => {
      const feeToken = '0x6666666666666666666666666666666666666666'
      const setting = stubSetting(sandbox)
      ;(CrossChainHandler._readFeeToken as sinon.SinonStub).resolves(feeToken)

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(8453), localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE } } as any,
        info,
      )

      expect(setting.crossChain.lanes[0].feeToken).to.equal(feeToken)
      expect((CrossChainHandler._readFeeToken as sinon.SinonStub).calledWith(ADAPTER_LOCAL, info.network)).to.equal(
        true,
      )
    })

    it('should keep the lane when the fee token cannot be read', async () => {
      const setting = stubSetting(sandbox)
      ;(CrossChainHandler._readFeeToken as sinon.SinonStub).resolves(null)

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(8453), localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE } } as any,
        info,
      )

      expect(setting.crossChain.lanes).to.have.lengthOf(1)
      expect(setting.crossChain.lanes[0].feeToken).to.equal(null)
    })

    it('should not read a fee token when the lane is cleared', async () => {
      stubSetting(sandbox, { lanes: [{ chainId: 8453, localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE }] })

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(8453), localAdapter: ZERO, remoteAdapter: ZERO } } as any,
        info,
      )

      expect((CrossChainHandler._readFeeToken as sinon.SinonStub).called).to.equal(false)
    })

    it('should replace an existing lane for the same chain id rather than duplicate it', async () => {
      const setting = stubSetting(sandbox, {
        lanes: [{ chainId: 8453, localAdapter: ZERO, remoteAdapter: ZERO }],
      })

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(8453), localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE } } as any,
        info,
      )

      expect(setting.crossChain.lanes).to.have.lengthOf(1)
      expect(setting.crossChain.lanes[0].localAdapter).to.equal(ADAPTER_LOCAL)
    })

    it('should remove the lane when both adapters are zeroed', async () => {
      const setting = stubSetting(sandbox, {
        lanes: [{ chainId: 8453, localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE }],
      })

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(8453), localAdapter: ZERO, remoteAdapter: ZERO } } as any,
        info,
      )

      expect(setting.crossChain.lanes).to.deep.equal([])
    })

    it('should keep lanes sorted by chain id', async () => {
      const setting = stubSetting(sandbox, {
        lanes: [{ chainId: 42161, localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE }],
      })

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(1), localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE } } as any,
        info,
      )

      expect(setting.crossChain.lanes.map((lane: any) => lane.chainId)).to.deep.equal([1, 42161])
    })
  })

  describe('executorUpdated', () => {
    it('should store the new executor and flag it as not the DAO', async () => {
      const setting = stubSetting(sandbox)

      await CrossChainHandler.executorUpdated({ args: { oldExecutor: ZERO, newExecutor: EXECUTOR } } as any, info)

      expect(setting.crossChain.executor).to.equal(EXECUTOR)
      expect(setting.crossChain.executorIsDao).to.equal(false)
    })

    it('should flag executorIsDao when the executor is the DAO itself', async () => {
      const setting = stubSetting(sandbox)

      await CrossChainHandler.executorUpdated({ args: { oldExecutor: EXECUTOR, newExecutor: DAO } } as any, info)

      expect(setting.crossChain.executor).to.equal(DAO)
      expect(setting.crossChain.executorIsDao).to.equal(true)
    })
  })

  describe('minFailedMessageGasUpdated', () => {
    it('should store the new gas reserve as a string', async () => {
      const setting = stubSetting(sandbox)

      await CrossChainHandler.minFailedMessageGasUpdated(
        { args: { oldMinFailedMessageGas: BigInt(0), newMinFailedMessageGas: BigInt(120000) } } as any,
        info,
      )

      expect(setting.crossChain.minFailedMessageGas).to.equal('120000')
    })

    it('should overwrite the previous gas reserve', async () => {
      const setting = stubSetting(sandbox, { minFailedMessageGas: '120000' })

      await CrossChainHandler.minFailedMessageGasUpdated(
        { args: { oldMinFailedMessageGas: BigInt(120000), newMinFailedMessageGas: BigInt(200000) } } as any,
        info,
      )

      expect(setting.crossChain.minFailedMessageGas).to.equal('200000')
    })
  })

  describe('guards', () => {
    it('should ignore events from a plugin that is not a crossChainController', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: CONTROLLER,
        daoAddress: DAO,
        interfaceType: IPluginInterfaceType.multisig,
      } as any)
      const findActive = sandbox.stub(Models.Setting, 'findActive').resolves(null as any)

      await CrossChainHandler.configUpdated(
        { args: { chainId: BigInt(1), localAdapter: ADAPTER_LOCAL, remoteAdapter: ADAPTER_REMOTE } } as any,
        info,
      )

      expect(findActive.called).to.equal(false)
    })

    it('should ignore events when the plugin is unknown', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null as any)
      const findActive = sandbox.stub(Models.Setting, 'findActive').resolves(null as any)

      await CrossChainHandler.executorUpdated({ args: { oldExecutor: ZERO, newExecutor: EXECUTOR } } as any, info)

      expect(findActive.called).to.equal(false)
    })
  })
})
