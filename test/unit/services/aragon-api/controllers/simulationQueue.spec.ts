import SimulationQueue from '@api/controllers/simulationQueue'
import config, { TENDERLY_RESPONSE_MARGIN_MS } from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { EnumQueueName, ErrorKeyEnum, ISimulationStatus, ITenderlyOperation, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const SOCKET_TIMEOUT = Math.min(config.SERVICES.ARAGON_API.TIMEOUT * 1000, config.RABBITMQ.TIMEOUT)

const request = () => ({
  operation: ITenderlyOperation.proposal as const,
  proposalId: 'proposal-1',
  sentAt: Date.now(),
})

describe('Controller: SimulationQueue', () => {
  let sandbox: SinonSandbox
  let clock: sinon.SinonFakeTimers
  let send: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sandbox.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    send = sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('sends the request to the simulation queue and stops waiting before the API socket closes', async () => {
    const result = { status: ISimulationStatus.SUCCESS, runAt: 1, network: NetworksEnum.ethereumMainnet }
    send.resolves(result)
    const sent = request()

    expect(await SimulationQueue.request(sent)).to.equal(result)
    expect(send.firstCall.args[0]).to.equal(EnumQueueName.simulationRun)
    expect(send.firstCall.args[1]).to.deep.equal({ id: ITenderlyOperation.proposal, params: sent })
    expect(send.firstCall.args[2]).to.deep.equal({
      waitResponse: true,
      timeout: SOCKET_TIMEOUT - TENDERLY_RESPONSE_MARGIN_MS,
    })
  })

  it('answers 503 before the socket closes when the reply lands after the deadline', async () => {
    const sent = request()
    send.callsFake(async (_queue, _message, { timeout }) => {
      clock.tick(timeout + 1)
      return { status: ISimulationStatus.SUCCESS, runAt: 1, network: NetworksEnum.ethereumMainnet }
    })

    const thrown: any = await SimulationQueue.request(sent).catch(error => error)

    expect(thrown.message).to.equal('tooBusy')
    expect(thrown.status).to.equal(503)
    expect(Date.now() - sent.sentAt).to.be.lessThan(SOCKET_TIMEOUT)
  })

  it('answers 503 when no reply came back', async () => {
    send.resolves(null)

    const thrown: any = await SimulationQueue.request(request()).catch(error => error)

    expect(thrown.message).to.equal('tooBusy')
    expect(thrown.status).to.equal(503)
  })

  it('answers 502 when the reply names an error key it does not know', async () => {
    send.resolves({ error: 'anything', errorKey: 'notARealKey', status: 418 })

    const thrown: any = await SimulationQueue.request(request()).catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.simulationFailed)
    expect(thrown.status).to.equal(502)
    expect(thrown.description).to.equal('The simulation could not be completed')
  })

  it('keeps the status and wording of a 400 refusal', async () => {
    send.resolves({
      error: 'Invalid plugin: must be a valid installed plugin',
      errorKey: ErrorKeyEnum.badSimulationRequest,
      status: 400,
    })

    const thrown: any = await SimulationQueue.request(request()).catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.badSimulationRequest)
    expect(thrown.status).to.equal(400)
    expect(thrown.description).to.equal('Invalid plugin: must be a valid installed plugin')
  })

  it('keeps the status and wording of a 404 refusal', async () => {
    send.resolves({ error: 'Proposal not found', errorKey: ErrorKeyEnum.notFound, status: 404 })

    const thrown: any = await SimulationQueue.request(request()).catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.notFound)
    expect(thrown.status).to.equal(404)
    expect(thrown.description).to.equal('Proposal not found')
  })
})
