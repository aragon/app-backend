import { throwExposable } from '@errors'
import CrossChainGasService from '@modules/crossChainGas'
import { CrossChainGasGateway } from '@services/aragon-gateway/crossChainGas'
import { ErrorKeyEnum, ICrossChainGasStatus, type IQueueCrossChainGasLimit, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const params: IQueueCrossChainGasLimit = {
  network: NetworksEnum.baseMainnet,
  controllerAddress: '0x53D16018a33f10D0b067fC70bf8FCF10a5da23Cb',
  destinationChainId: 1,
  actions: [{ to: '0x4200000000000000000000000000000000000006', value: '0', data: '0x095ea7b3' }],
}

describe('Gateway: crossChainGas', () => {
  let sandbox: SinonSandbox
  let estimate: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    estimate = sandbox.stub(CrossChainGasService, 'estimateCrossChainGasLimit')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('passes the queue params through to the estimator in order', async () => {
    estimate.resolves({ status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: 1 })

    const result = await CrossChainGasGateway.estimateGasLimit(params)

    expect(result).to.deep.equal({ status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: 1 })
    expect(estimate.firstCall.args).to.deep.equal([
      params.network,
      params.controllerAddress,
      params.destinationChainId,
      params.actions,
    ])
  })

  it('returns a reverted estimate unchanged - it is a result, not a failure', async () => {
    const reverted = { status: ICrossChainGasStatus.REVERTED, revertReason: 'nope', runAt: 1 }
    estimate.resolves(reverted)

    expect(await CrossChainGasGateway.estimateGasLimit(params)).to.deep.equal(reverted)
  })

  describe('failures are returned, never thrown', () => {
    // RabbitMQHelper.process swallows a thrown handler without replying, so the caller would only
    // ever see a timeout. Every failure has to come back as a value.
    it('maps an exposable error to its key and description', async () => {
      estimate.callsFake(() => {
        throwExposable(ErrorKeyEnum.crossChainLaneNotConfigured, 400, 'No lane for this destination')
      })

      const result = await CrossChainGasGateway.estimateGasLimit(params)

      expect(result).to.deep.equal({
        error: 'No lane for this destination',
        errorKey: ErrorKeyEnum.crossChainLaneNotConfigured,
      })
    })

    it('preserves the 501 key so the API does not turn it into a 400', async () => {
      estimate.callsFake(() => {
        throwExposable(ErrorKeyEnum.crossChainBridgeUnsupported, 501, 'Not a CCIP adapter')
      })

      const result: any = await CrossChainGasGateway.estimateGasLimit(params)

      expect(estimate.calledOnce).to.be.true
      expect(result.errorKey).to.equal(ErrorKeyEnum.crossChainBridgeUnsupported)
      expect(result.error).to.equal('Not a CCIP adapter')
    })

    it('maps an unexpected error to a simulation failure rather than leaking it', async () => {
      estimate.rejects(new Error('ECONNRESET'))

      const result: any = await CrossChainGasGateway.estimateGasLimit(params)

      expect(result.errorKey).to.equal(ErrorKeyEnum.crossChainSimulationFailed)
      expect(result.error).to.not.contain('ECONNRESET')
    })

    it('never throws, whatever the estimator does', async () => {
      estimate.rejects(new Error('boom'))

      await expect(CrossChainGasGateway.estimateGasLimit(params)).to.not.be.rejected
    })
  })
})
