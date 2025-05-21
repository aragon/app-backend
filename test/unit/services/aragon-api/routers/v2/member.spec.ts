import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberRouter from '@api/routers/v2/member'
import MemberController from '@api/controllers/member'
import MemberSchema from '@api/routers/schema/member'
import PaginationSchema from '@api/routers/schema/pagination'
import ValidationSchema from '@helpers/validationSchema'

describe('Router: Member', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should check if a member is part of a plugin', async () => {
    const params = {
      memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      pluginAddress: '0xPluginAddress123',
    }

    const ctx: any = {
      params,
      query: {},
    }

    const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(params)

    const stubCtrl = sandbox.stub(MemberController, 'isMemberOfPlugin').resolves(true as any)

    await MemberRouter.isMemberOfPlugin(ctx)

    expect(validateParamsStub.calledTwice).to.be.true
    expect(validateParamsStub.calledWith(MemberSchema.isMemberOfPlugin, params)).to.be.true
    expect(validateParamsStub.calledWith(PaginationSchema.getNotAllowedParams, {})).to.be.true

    expect(stubCtrl.calledOnceWith(params.memberAddress, params.pluginAddress)).to.be.true // Ensure the controller is called correctly
    expect(ctx.body).to.eq(true)
  })
})
