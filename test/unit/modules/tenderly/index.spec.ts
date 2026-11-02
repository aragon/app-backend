import logger from '@logger'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import TenderlyTransport from '@modules/tenderly/transport'
import { ISimulationStatus, ITenderlyOperation, type ITenderlySendContext, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const DAO = '0x1111111111111111111111111111111111111111'
const PLUGIN = '0x2222222222222222222222222222222222222222'

const simulation = { to: DAO, data: '0xabcdef', from: PLUGIN }

const context = (): ITenderlySendContext => ({
  operation: ITenderlyOperation.pluginActions,
  network: NetworksEnum.ethereumMainnet,
  daoAddress: DAO,
  deadlineAt: Date.now() + 30_000,
})

describe('Module: tenderly', () => {
  let sandbox: SinonSandbox
  let send: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(ProviderModule, 'getChainId').returns(1)
    sandbox.stub(TenderlyTransport, 'share').resolves('https://share.url')
    send = sandbox.stub(TenderlyTransport, 'simulate')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('simulate', () => {
    it('sends the DAO execute call with the context it was given', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: true } })
      const ctx = context()

      await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, ctx)

      expect(send.firstCall.args[0]).to.deep.equal({
        network_id: '1',
        from: PLUGIN,
        input: '0xabcdef',
        to: DAO,
        gas: 8000000,
        gas_price: '0',
        value: '0',
        save: true,
      })
      expect(send.firstCall.args[1]).to.equal(ctx)
    })

    it('reports success with the share link and the run time', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: true } })

      const result = await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://share.url')
      expect(result.runAt).to.be.a('number')
    })

    it('marks the simulation failed when the transaction reverted', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: false } })

      const result = await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.FAILED)
    })

    it('marks the simulation failed when the provider reports an error message', async () => {
      send.resolves({
        simulation: { id: 'sim-1' },
        transaction: { status: true, error_info: { error_message: 'execution reverted' } },
      })

      const result = await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.FAILED)
    })
  })

  describe('simulateRaw', () => {
    it('never asks the provider to search for gas and simulates on the given chain', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: true } })

      await TenderlyModule.simulateRaw({ chainId: 8453, from: PLUGIN, to: DAO, input: '0xabcdef', gas: 30_000_000 }, {
        ...context(),
        operation: ITenderlyOperation.crossChainGas,
        controllerAddress: PLUGIN,
      } as any)

      const payload = send.firstCall.args[0]
      expect(payload.network_id).to.equal('8453')
      expect(payload.estimate_gas).to.equal(false)
      expect(payload.gas).to.equal(30_000_000)
      expect(payload.simulation_type).to.equal('full')
    })
  })

  describe('simulateFull', () => {
    it('marks the simulation failed when the transaction reverted without an error message', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: false } })

      const result = await TenderlyModule.simulateFull(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result).to.deep.include({
        shareUrl: 'https://share.url',
        status: ISimulationStatus.FAILED,
        error: undefined,
      })
    })

    it('returns the asset changes and contracts when the transaction went through', async () => {
      send.resolves({
        simulation: { id: 'sim-1' },
        transaction: { status: true, transaction_info: { asset_changes: [{ type: 'Transfer' }], balance_changes: [] } },
        contracts: [{ address: DAO }],
      })

      const result = await TenderlyModule.simulateFull(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.assetChanges).to.deep.equal([{ type: 'Transfer' }])
      expect(result.contracts).to.deep.equal([{ address: DAO }])
    })
  })
})
