import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import DispatchSimulationController from '@services/aragon-api/controllers/dispatchSimulation'
import SimulationDao from '@services/aragon-dao/simulation'
import { DaoList } from '@test/mock/fakeDao'
import {
  EnumQueueName,
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  ITenderlyOperation,
  NetworksEnum,
} from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const dao = DaoList[1]
const POLICY = '0x1234567890123456789012345678901234567890'
const OTHER_POLICY = '0x9999999999999999999999999999999999999999'
const FROM = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const ok = { simulation: { id: 'sim-1' }, transaction: { status: true } }
const reverted = {
  simulation: { id: 'sim-1' },
  transaction: { status: false, error_info: { error_message: 'execution reverted' } },
}

const simulate = (policyAddress = POLICY, data?: string) =>
  DispatchSimulationController.simulateDispatchSummary(policyAddress, NetworksEnum.ethereumMainnet, FROM, data)

describe('Controller: DispatchSimulation', () => {
  let sandbox: SinonSandbox
  let axiosPost: sinon.SinonStub
  let sendMessage: sinon.SinonStub

  const simulatePosts = () => axiosPost.getCalls().filter(call => call.args[0].endsWith('/simulate'))

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(config.TENDERLY, 'PROJECT').value('project')
    sandbox.stub(config.TENDERLY, 'USER').value('user')
    sandbox.stub(config.TENDERLY, 'ACCESS_KEY').value('secret-access-key')
    sandbox.stub(config.TENDERLY, 'MIN_TIME').value(0)
    BottleneckModule.tenderlyLimiter = null
    sandbox.stub(ProviderModule, 'getChainId').returns(1)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)
    axiosPost = sandbox.stub(axios, 'post').callsFake(async (url: string) => ({
      data: url.endsWith('/share') ? { share_url: 'https://share.url' } : ok,
    }))
    sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .callsFake(async (_queue, job) => SimulationDao.run(job.params))

    await Models.Dao.create(dao)
    await Models.Plugin.create({
      id: 'policy-1',
      address: POLICY,
      daoAddress: dao.address,
      network: NetworksEnum.ethereumMainnet,
      interfaceType: IPluginInterfaceType.unknown,
      status: IPluginStatus.installed,
      isPolicy: true,
      transactionHash: '0xinstall',
      blockNumber: 10,
    })
  })

  afterEach(() => {
    BottleneckModule.tenderlyLimiter = null
    sandbox?.restore()
  })

  it('queues the dispatch and returns its summary', async () => {
    const summary = await simulate()

    expect(summary).to.deep.equal({ status: 'success', tenderlyUrl: 'https://share.url', summaryGroups: [] })
    expect(sendMessage.firstCall.args[0]).to.equal(EnumQueueName.simulationRun)
    expect(sendMessage.firstCall.args[1].params).to.include({
      operation: ITenderlyOperation.dispatch,
      policyAddress: POLICY,
      network: NetworksEnum.ethereumMainnet,
      from: FROM,
    })
    expect(sendMessage.firstCall.args[1].params.sentAt).to.be.a('number')
    expect(sendMessage.firstCall.args[2]).to.include({ waitResponse: true })
  })

  it('passes the supplied calldata to the simulation', async () => {
    await simulate(POLICY, '0xc0ffee')

    expect(simulatePosts()[0].args[1]).to.include({ to: POLICY, from: FROM, input: '0xc0ffee' })
  })

  it('returns a failed summary as a result, fresh and cached, never as an error', async () => {
    axiosPost.callsFake(async (url: string) => ({
      data: url.endsWith('/share') ? { share_url: 'https://share.url' } : reverted,
    }))

    const first = await simulate()
    const second = await simulate()

    expect(first).to.deep.equal({
      status: 'failed',
      error: 'execution reverted',
      tenderlyUrl: 'https://share.url',
      summaryGroups: [],
    })
    expect(second).to.deep.equal(first)
    expect(simulatePosts()).to.have.length(1)
  })

  it('answers 400 when the policy is not installed', async () => {
    const thrown: any = await simulate(OTHER_POLICY).catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.badSimulationRequest)
    expect(thrown.status).to.equal(400)
    expect(thrown.description).to.equal('Policy not found or not installed')
    expect(axiosPost.called).to.be.false
  })

  it('answers 429 and sends nothing when the hourly budget is finished', async () => {
    sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_HOUR').value(0)

    const thrown: any = await simulate().catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.simulationBudgetExhausted)
    expect(thrown.status).to.equal(429)
    expect(axiosPost.called).to.be.false
  })

  it('answers 503 and sends nothing when Tenderly is not configured', async () => {
    sandbox.stub(config.TENDERLY, 'ACCESS_KEY').value(null)

    const thrown: any = await simulate().catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.tooBusy)
    expect(thrown.status).to.equal(503)
    expect(axiosPost.called).to.be.false
  })

  it('answers 502 when Tenderly fails', async () => {
    axiosPost.rejects({ response: { status: 500 } })

    const thrown: any = await simulate().catch(error => error)

    expect(thrown.message).to.equal(ErrorKeyEnum.simulationFailed)
    expect(thrown.status).to.equal(502)
  })
})
