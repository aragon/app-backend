import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { v4 as uuidv4 } from 'uuid'

describe('Dep: uuidv4', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('uuidv4', () => {
    const id = uuidv4()
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(id).to.match(uuidV4Regex)
  })
})
