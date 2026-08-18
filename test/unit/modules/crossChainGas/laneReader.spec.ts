import { CrossChainController } from '@artifacts/CrossChainController'
import { CCIPAdapter } from '@artifacts/ccip'
import CrossChainLaneReader from '@modules/crossChainGas/laneReader'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import logger from '@logger'

const abiCoder = AbiCoder.defaultAbiCoder()
const adapterInterface = new Interface(CCIPAdapter.abi)
const controllerInterface = new Interface(CrossChainController.abi)

const CONTROLLER = '0x1111111111111111111111111111111111111111'
const LOCAL_ADAPTER = '0x3333333333333333333333333333333333333333'
const REMOTE_ADAPTER = '0x2222222222222222222222222222222222222222'
const DEST_CONTROLLER = '0x4444444444444444444444444444444444444444'
const CCIP_ROUTER = '0x5555555555555555555555555555555555555555'
const EXECUTOR = '0x6666666666666666666666666666666666666666'

const ETH_SELECTOR = 5009297550715157269n

/**
 * A fake provider driven by a `to -> selector -> return data` table. Anything not in the table
 * reverts, which is how the code under test is meant to discover unsupported bridges.
 */
function fakeProvider(table: Record<string, Record<string, string>>) {
  return {
    async call({ to, data }: { to: string; data: string }) {
      const entry = table[to.toLowerCase()]?.[data.slice(0, 10).toLowerCase()]
      if (entry === undefined) throw Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION' })
      return entry
    },
  }
}

describe('Module: crossChainGas/laneReader', () => {
  let sandbox: SinonSandbox
  let loggerError: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // `Web3Helper.rawCall` logs the real cause before rethrowing, and the tests that reach it check
    // the cause was recorded - the caller never gets to see it.
    loggerError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('readLane', () => {
    const destinationTable = (): Record<string, Record<string, string>> => ({
      [REMOTE_ADAPTER.toLowerCase()]: {
        '0xfe5f42ca': abiCoder.encode(['address'], [CCIP_ROUTER]),
        '0xc4956366': abiCoder.encode(['address'], [DEST_CONTROLLER]),
        '0x5c677fe2': abiCoder.encode(['uint256'], [ETH_SELECTOR]),
      },
      [DEST_CONTROLLER.toLowerCase()]: {
        '0xee404fe8': abiCoder.encode(['uint256'], [45_000]),
        '0xc34c08e5': abiCoder.encode(['address'], [EXECUTOR]),
      },
    })

    function stubProviders(
      destination: Record<string, Record<string, string>>,
      adapters = [LOCAL_ADAPTER, REMOTE_ADAPTER],
    ) {
      const originProvider = {
        call: async () => abiCoder.encode(['address', 'address'], [adapters[0], adapters[1]]),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake((network: NetworksEnum) => {
        if (network === NetworksEnum.ethereumMainnet) return originProvider
        if (network === NetworksEnum.baseMainnet) return fakeProvider(destination)
        return undefined
      })
    }

    const read = () =>
      CrossChainLaneReader.readLane({
        network: NetworksEnum.ethereumMainnet,
        controllerAddress: CONTROLLER,
        destinationChainId: 8453,
      })

    it('resolves every lane fact from the chain', async () => {
      stubProviders(destinationTable())

      const result = await read()

      expect(result.localAdapter).to.equal(LOCAL_ADAPTER)
      expect(result.remoteAdapter).to.equal(REMOTE_ADAPTER)
      expect(result.ccipRouter).to.equal(CCIP_ROUTER)
      expect(result.destinationController).to.equal(DEST_CONTROLLER)
      expect(result.originChainSelector).to.equal(ETH_SELECTOR)
      expect(result.minFailedMessageGas).to.equal(45_000n)
      expect(result.executor).to.equal(EXECUTOR)
      expect(result.destinationNetwork).to.equal(NetworksEnum.baseMainnet)
    })

    it('lets a node failure through instead of calling it a misconfigured lane', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        call: async () => {
          throw new Error('server response 403 (requestUrl="https://lb.drpc.org/ogrpc?dkey=SECRET_KEY")')
        },
      })

      const thrown: any = await read().catch(e => e)

      expect(thrown.message).to.not.equal('crossChainLaneNotConfigured')
      expect(thrown.exposeCustom_).to.be.undefined
      expect(loggerError.firstCall.args[0]).to.equal('Raw call transport failure')
      expect(loggerError.firstCall.args[1].error).to.contain('server response 403')
    })

    it('rejects an unconfigured lane with a 400', async () => {
      stubProviders(destinationTable(), [
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
      ])

      await expect(read()).to.be.rejectedWith('crossChainLaneNotConfigured')
    })

    it('rejects a non-CCIP adapter with a 501 rather than guessing a simulation shape', async () => {
      const table = destinationTable()
      delete table[REMOTE_ADAPTER.toLowerCase()]['0xfe5f42ca']
      stubProviders(table)

      await expect(read()).to.be.rejectedWith('crossChainBridgeUnsupported')
    })

    it('does not report a destination node failure as a misconfigured lane', async () => {
      const originProvider = {
        call: async () => abiCoder.encode(['address', 'address'], [LOCAL_ADAPTER, REMOTE_ADAPTER]),
      }
      const destinationProvider = {
        call: async () => {
          throw Object.assign(new Error('ECONNRESET'), { code: 'NETWORK_ERROR' })
        },
      }
      sandbox
        .stub(ProviderModule, 'getAnyRpcProvider')
        .callsFake((network: NetworksEnum) =>
          network === NetworksEnum.ethereumMainnet ? originProvider : destinationProvider,
        )

      const thrown: any = await read().catch(error => error)

      expect(thrown.message).to.equal('ECONNRESET')
      expect(thrown.message).to.not.equal('crossChainLaneNotConfigured')
      expect(loggerError.firstCall.args[1]).to.include({ network: NetworksEnum.baseMainnet, error: 'ECONNRESET' })
    })

    it('rejects a destination chain with no provider with a 501', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake((network: NetworksEnum) => {
        if (network === NetworksEnum.ethereumMainnet) {
          return { call: async () => abiCoder.encode(['address', 'address'], [LOCAL_ADAPTER, REMOTE_ADAPTER]) }
        }
        return undefined
      })

      await expect(read()).to.be.rejectedWith('crossChainBridgeUnsupported')
    })

    it('rejects with a 501 when CCIP does not map the origin chain', async () => {
      const table = destinationTable()
      delete table[REMOTE_ADAPTER.toLowerCase()]['0x5c677fe2']
      stubProviders(table)

      await expect(read()).to.be.rejectedWith('crossChainBridgeUnsupported')
    })

    it('rejects when the reserve cannot be read, since it is not optional', async () => {
      const table = destinationTable()
      delete table[DEST_CONTROLLER.toLowerCase()]['0xee404fe8']
      stubProviders(table)

      await expect(read()).to.be.rejectedWith('crossChainLaneNotConfigured')
    })

    it('does not spend a call verifying the lane trusts the controller', async () => {
      // `ccipReceive` performs that check itself; re-checking it here would be an extra RPC round
      // trip that cannot change the answer. `trustedRemote` is absent from the table entirely,
      // so calling it would revert and fail the read.
      stubProviders(destinationTable())

      const result = await read()

      expect(result.remoteAdapter).to.equal(REMOTE_ADAPTER)
    })
  })

  it('encodes reads with the deployed selectors', () => {
    expect(adapterInterface.encodeFunctionData('CCIP_ROUTER')).to.equal('0xfe5f42ca')
    expect(adapterInterface.encodeFunctionData('CROSS_CHAIN_CONTROLLER')).to.equal('0xc4956366')
    expect(adapterInterface.encodeFunctionData('toNativeChainId', [1]).slice(0, 10)).to.equal('0x5c677fe2')
    expect(controllerInterface.encodeFunctionData('minFailedMessageGas')).to.equal('0xee404fe8')
    expect(controllerInterface.encodeFunctionData('executor')).to.equal('0xc34c08e5')
  })
})
