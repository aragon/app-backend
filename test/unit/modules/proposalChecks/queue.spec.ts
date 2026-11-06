import config from '@config'
import ProposalCheckQueue from '@modules/proposalChecks/queue'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const payload = { id: 'req-1', params: { requestId: 'req-1' } }

describe('proposalChecks/queue', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('publishes a persistent JSON message with the channel timeout and resolves once the broker confirms', async () => {
    const sendToQueue = sandbox.stub().resolves(true)
    sandbox.stub(RabbitMQ, 'getChannel').returns({ sendToQueue } as any)

    await ProposalCheckQueue.publish(payload)

    expect(sendToQueue.calledOnce).to.be.true
    expect(sendToQueue.args[0][0]).to.eq(EnumQueueName.proposalChecks)
    expect(sendToQueue.args[0][1]).to.deep.eq(payload)
    expect(sendToQueue.args[0][2]).to.deep.eq({
      persistent: true,
      contentType: 'application/json',
    })
  })

  it('rejects when the broker refuses or times out, instead of logging it away like the shared helper', async () => {
    sandbox.stub(RabbitMQ, 'getChannel').returns({ sendToQueue: sandbox.stub().rejects(new Error('timeout')) } as any)

    let error: any
    try {
      await ProposalCheckQueue.publish(payload)
    } catch (err) {
      error = err
    }

    expect(error?.message).to.eq('timeout')
  })

  it('states the retry policy the queue envelope applies', () => {
    expect(ProposalCheckQueue.retryOptions()).to.deep.eq({
      retry: {
        maxAttempts: config.PROPOSAL_CHECKS.MAX_ATTEMPTS,
        baseDelayMs: config.PROPOSAL_CHECKS.RETRY_BASE_DELAY_MS,
        maxDelayMs: config.PROPOSAL_CHECKS.RETRY_MAX_DELAY_MS,
        deadLetterQueue: EnumQueueName.proposalChecksDeadLetter,
      },
    })
  })
})
