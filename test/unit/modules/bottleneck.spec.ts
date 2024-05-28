import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BottleneckModule from '@modules/bottleneck'
import { NetworksEnum } from '@types'

describe('Module: bottleneck', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('returns the same instance for the same network', () => {
    const limiter1 = BottleneckModule.getLimiter(NetworksEnum.mainnet)
    const limiter2 = BottleneckModule.getLimiter(NetworksEnum.mainnet)

    expect(limiter1).to.eq(limiter2)
  })

  it('returns different instances for different networks', () => {
    const limiter1 = BottleneckModule.getLimiter(NetworksEnum.mainnet)
    const limiter2 = BottleneckModule.getLimiter(NetworksEnum.sepolia)

    expect(limiter1).not.eq(limiter2)
  })
})
