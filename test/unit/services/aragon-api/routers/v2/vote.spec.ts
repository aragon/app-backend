import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import VoteRouter from '@api/routers/v2/vote'
import VoteController from '@api/controllers/vote'
import { NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'
import VoteSchema from '@api/routers/schema/vote'

describe('Router: Vote', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should check if a member can vote', async () => {
    const ctx: any = {
      query: {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0xPluginAddress123',
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
      },
    }

    const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(ctx.query)

    const stubCtrl = sandbox.stub(VoteController, 'canVote').resolves(true as any)

    await VoteRouter.canVote(ctx)

    expect(validateParamsStub.calledOnce).to.be.true
    expect(
      validateParamsStub.calledWith(VoteSchema.canVote, {
        memberAddress: ctx.query.memberAddress,
        pluginAddress: ctx.query.pluginAddress,
        proposalIndex: ctx.query.proposalIndex,
        network: ctx.query.network,
      }),
    ).to.be.true

    expect(stubCtrl.calledOnceWith(ctx.query)).to.be.true
    expect(ctx.body.status).to.eq(true)
  })
})
