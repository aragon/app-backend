import { Models } from '@dbModels'
import Jwt from '@models/schema/jwt'
import { IJwtAuthType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: Jwt', () => {
  let sandbox: SinonSandbox
  let rawJwt: Partial<Jwt>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawJwt = {
      value: 'some-value',
      type: IJwtAuthType.auth,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Jwt', async () => {
    const createdJwt = await Models.Jwt.create(rawJwt)

    expect(createdJwt.id).to.not.exist
    expect(createdJwt.value).to.eq(rawJwt.value)
    expect(createdJwt.type).to.eq(rawJwt.type)
  })

  it('Should find Jwt by value', async () => {
    const createdJwt = await Models.Jwt.create(rawJwt)
    const jwt = await Models.Jwt.findByValue(createdJwt.value)
    expect(jwt?.value).to.eq(createdJwt.value)
  })

  it('Should reload', async () => {
    const createdJwt = await Models.Jwt.create(rawJwt)
    await createdJwt.reload()

    expect(createdJwt.value).to.eq(rawJwt.value)
  })

  it('should updateOnly', async () => {
    const createdJwt = await Models.Jwt.create(rawJwt)
    const updatedAt = createdJwt.updatedAt
    const updatedJwt = await createdJwt.updateOnly()
    expect(updatedJwt.updatedAt !== updatedAt).to.be.true
  })
})
