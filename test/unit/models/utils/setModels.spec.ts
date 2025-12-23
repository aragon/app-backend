import logger from '@logger'
import { setMongoModels } from '@models/utils/setModels'
import { getModelForClass } from '@typegoose/typegoose'
import { expect } from 'chai'
import * as fs from 'fs'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model/Utils: setModels', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('successfully loads models', async function () {
    const stubLogger = sandbox.stub(logger, 'error')
    sandbox.stub(getModelForClass as any, 'call').returnsArg(0)

    const schemas = await setMongoModels()

    expect(schemas).to.have.property('Dao')
    expect(stubLogger.notCalled).to.be.true
  })

  it('successfully loads models', async function () {
    const stubPromise = sandbox.stub(fs.promises, 'readdir').resolves(['User.js', 'Post.js'] as any)
    const stubLogger = sandbox.stub(logger, 'error')

    const schemas = await setMongoModels()

    expect(schemas).not.to.have.property('Dao')
    expect(stubPromise.calledOnce).to.be.true
    expect(stubLogger.callCount).to.eq(2)
  })
})
