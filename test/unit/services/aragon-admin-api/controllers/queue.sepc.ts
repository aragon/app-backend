import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import QueueAdminController from '@services/aragon-admin-api/controllers/queue'
import { Models } from '@dbModels'
import { EnumQueueName, ErrorKeyEnum, IPluginInterfaceType, IPluginStatus } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { PluginSlug } from '@helpers/pluginSlug'

describe('Controller: QueueAdmin', () => {
  let sandbox: SinonSandbox
  let rabbitMQ: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    rabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should queue plugins successfully', async () => {
    const params = { address: '0x123', network: 'mainnet' }
    sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: 'mainnet' })
    sandbox.stub(Models.Plugin, 'find').resolves([
      {
        address: '0x456',
        network: 'mainnet',
        status: IPluginStatus.installed,
      },
    ])
    sandbox.stub(Models.PluginSlug, 'findOne').resolves(null)
    const stubSlug = sandbox.stub(PluginSlug, 'generateSlug').resolves()

    const result = await QueueAdminController.queuePlugins(params)

    expect(result).to.be.true
    expect(stubSlug.calledOnce).to.be.true
    expect(rabbitMQ.calledOnce).to.be.true
  })

  it('should queue proposal metrics successfully', async () => {
    const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
    sandbox.stub(Models.Plugin, 'findOne').resolves({
      address: '0x456',
      network: 'mainnet',
      interfaceType: IPluginInterfaceType.tokenVoting,
      status: IPluginStatus.installed,
    })

    sandbox
      .stub(Models.Proposal, 'findOne')
      .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

    const result = await QueueAdminController.queueProposalMetrics(params)

    expect(result).to.be.true
    expect(rabbitMQ.calledOnce).to.be.true
    expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.proposalTokenVotingMetrics)
  })

  it('should throw error if DAO not found', async () => {
    const params = { address: '0x123', network: 'mainnet' }
    sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

    await expect(QueueAdminController.queueDaoAssets(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
  })
})
