import { Models } from '@dbModels'
import logger from '@logger'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import fixCampaignCreateActionDecodingMigration from '@src/migrations/20260225132314-fixCampaignCreateActionDecoding'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

const CAMPAIGN_CREATE_DATA =
  '0x3d4ebc5b00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000697b3608'

const BASE_PROPOSAL = {
  transactionHash: '0xabc123',
  blockNumber: 100,
  blockTimestamp: 1000,
  network: NetworksEnum.ethereumMainnet,
  pluginAddress: '0x1111111111111111111111111111111111111111',
  daoAddress: '0x2222222222222222222222222222222222222222',
  creatorAddress: '0x3333333333333333333333333333333333333333',
  startDate: 1000,
  endDate: 2000,
}

const FIXED_ACTIONS = [
  {
    data: CAMPAIGN_CREATE_DATA,
    inputData: {
      function: 'createCampaign',
      textSignature: 'createCampaign(bytes,tuple,tuple,tuple)',
      parameters: [
        { name: 'metadata', type: 'bytes', value: '0xaaa' },
        { name: 'strategy', type: 'tuple', value: [] },
        { name: 'distribution', type: 'tuple', value: [] },
        { name: 'reward', type: 'tuple', value: [] },
      ],
    },
  },
]

describe('migration: fixCampaignCreateActionDecoding', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should re-decode proposals where createCampaign has fewer than 4 params and verify DB update', async () => {
    sandbox.stub(ProposalHandler, 'parseActions').callsFake(async (proposal: any) => {
      proposal.actions = FIXED_ACTIONS
      await proposal.save()
    })

    await Models.Proposal.insertMany([
      {
        ...BASE_PROPOSAL,
        id: 'proposal-broken',
        proposalIndex: '0',
        incrementalId: 0,
        rawActions: [{ to: '0x83DABe7727EEDB1051a51Ea324C8963BCe2C6C63', value: '0', data: CAMPAIGN_CREATE_DATA }],
        actions: [
          {
            data: CAMPAIGN_CREATE_DATA,
            inputData: {
              function: 'createCampaign',
              textSignature: 'createCampaign(bytes,bytes)',
              parameters: [
                { name: 'param0', type: 'bytes', value: '0x1234' },
                { name: 'param1', type: 'bytes', value: '0x5678' },
              ],
            },
          },
        ],
      },
    ])

    await fixCampaignCreateActionDecodingMigration.start()

    const updated = await Models.Proposal.findOne({ id: 'proposal-broken' })
    expect(updated).to.not.be.null
    expect(updated!.actions[0].inputData.parameters).to.have.length(4)
    expect(updated!.actions[0].inputData.textSignature).to.eq('createCampaign(bytes,tuple,tuple,tuple)')
  })

  it('should skip proposals where createCampaign already has 4 params', async () => {
    const parseActionsStub = sandbox.stub(ProposalHandler, 'parseActions').resolves()

    await Models.Proposal.insertMany([
      {
        ...BASE_PROPOSAL,
        id: 'proposal-correct',
        proposalIndex: '1',
        incrementalId: 1,
        rawActions: [{ to: '0x83DABe7727EEDB1051a51Ea324C8963BCe2C6C63', value: '0', data: CAMPAIGN_CREATE_DATA }],
        actions: [
          {
            data: CAMPAIGN_CREATE_DATA,
            inputData: {
              function: 'createCampaign',
              textSignature: 'createCampaign(bytes,tuple,tuple,tuple)',
              parameters: [
                { name: 'metadata', type: 'bytes', value: '0x1234' },
                { name: 'strategy', type: 'tuple', value: [] },
                { name: 'distribution', type: 'tuple', value: [] },
                { name: 'reward', type: 'tuple', value: [] },
              ],
            },
          },
        ],
      },
    ])

    await fixCampaignCreateActionDecodingMigration.start()

    expect(parseActionsStub.notCalled).to.be.true
  })

  it('should handle no matching proposals', async () => {
    const parseActionsStub = sandbox.stub(ProposalHandler, 'parseActions').resolves()

    await Models.Proposal.insertMany([
      {
        ...BASE_PROPOSAL,
        id: 'proposal-other',
        proposalIndex: '2',
        incrementalId: 2,
        rawActions: [{ to: '0xabc', value: '0', data: '0x40c10f19000000000000000000000000abc' }],
        actions: [{ inputData: { function: 'mint', parameters: [{ name: 'to' }, { name: 'amount' }] } }],
      },
    ])

    await fixCampaignCreateActionDecodingMigration.start()

    expect(parseActionsStub.notCalled).to.be.true
  })
})
