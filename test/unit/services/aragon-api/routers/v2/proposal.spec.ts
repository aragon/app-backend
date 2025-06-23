import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProposalRouter from '@api/routers/v2/proposal'
import ProposalController from '@api/controllers/proposal'
import { NetworksEnum } from '@types'
import ProposalSchema from '@api/routers/schema/proposal'
import ValidationSchema from '@helpers/validationSchema'

describe('Router: Proposal', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should check if a member can create a proposal with canCreateProposal', async () => {
    const ctx: any = {
      query: {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0xPluginAddress123',
        network: NetworksEnum.ethereumMainnet,
      },
    }

    const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(ctx.query)

    const stubCtrl = sandbox.stub(ProposalController, 'canCreateProposal').resolves(true as any)

    await ProposalRouter.canCreateProposal(ctx)

    expect(validateParamsStub.calledOnce).to.be.true
    expect(
      validateParamsStub.calledWith(ProposalSchema.canCreateProposal, {
        memberAddress: ctx.query.memberAddress,
        pluginAddress: ctx.query.pluginAddress,
        network: ctx.query.network,
      }),
    ).to.be.true

    expect(stubCtrl.calledOnceWith(ctx.query)).to.be.true
    expect(ctx.body).to.deep.eq({ status: true })
  })
})
