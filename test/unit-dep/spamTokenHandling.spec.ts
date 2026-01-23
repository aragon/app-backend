import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: Spam Token Handling', () => {
  let sandbox: SinonSandbox

  const spamTokenAddress = '0xEdb0fA3cc63211961814b10b75DfC5b9ec77f6CF'
  const normalTokenAddress = '0x27c4bd073D2e2c1d908c40AACF245Fff2A67A95e'
  const network = NetworksEnum.polygonMainnet

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should save spam token with isSpam=true and spamScore, then return null on subsequent calls', async function () {
    this.timeout(60000)

    const firstResult = await ProxyToken.saveAndGetToken(spamTokenAddress, network)

    expect(firstResult).to.be.null

    const savedToken = await Models.Token.findOne({ address: spamTokenAddress, network })
    expect(savedToken).to.not.be.null
    expect(savedToken!.isSpam).to.be.true
    expect(savedToken!.spamScore).to.be.a('number')
    expect(savedToken!.spamScore).to.be.greaterThan(0)

    const secondResult = await ProxyToken.saveAndGetToken(spamTokenAddress, network)
    expect(secondResult).to.be.null
  })

  it('should save normal token and return it on subsequent calls', async function () {
    this.timeout(60000)

    const firstResult = await ProxyToken.saveAndGetToken(normalTokenAddress, network)

    expect(firstResult).to.not.be.null
    expect(firstResult!.address).to.equal(normalTokenAddress)
    expect(firstResult!.isSpam).to.be.false

    const secondResult = await ProxyToken.saveAndGetToken(normalTokenAddress, network)
    expect(secondResult).to.not.be.null
    expect(secondResult!.id).to.equal(firstResult!.id)
  })
})
