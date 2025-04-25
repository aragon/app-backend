import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum, ProposalActionType } from '@types'
import DecodeActions from '@helpers/decodeAction'
import { expect } from 'chai'
import { ProxyToken } from '@modules/proxyToken'
import CovalentHelper from '@helpers/covalent'
import BlockScoutHelper from '@helpers/blockScout'

describe.only('Integ: decodeAction', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should parse properly when to is not a token', async () => {
    const result = await BlockScoutHelper.getTokenHolders(
      '0x1111111111166b7FE7bd91427724B487980aFc69',
      NetworksEnum.baseMainnet,
    )
    console.log(result)
    console.log(result)
  })
})
