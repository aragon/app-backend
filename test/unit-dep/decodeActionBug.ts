import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum, ProposalActionType } from '@types'
import DecodeActions from '@helpers/decodeAction'
import { expect } from 'chai'
import { ProxyToken } from '@modules/proxyToken'
import CovalentHelper from '@helpers/covalent'

describe('Unit-dep: Block Handler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('decodeAction when mint is wired data', () => {
    it('should parse properly when to is not a token', async () => {
      const action = {
        data: '0x40c10f1900000000000000000000000032c2fe388abbb3e678d44df6a0471086d705316a0000000000000000000000000000000000000000000000000000000000000001',
        to: '0x32c2FE388ABbB3e678D44DF6a0471086D705316a',
        value: '0',
      }

      const decodeAction = new DecodeActions()
      const proxyTokenSpy = sandbox.spy(ProxyToken, 'saveAndGetToken')

      const decoded: any = await decodeAction.decodeData(action, {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0xDaoAddress',
        blockNumber: 7051636,
      })

      expect(decoded?.type).to.be.eq(ProposalActionType.Mint)
      expect(decoded?.token).to.deep.eq({
        address: '0x32c2FE388ABbB3e678D44DF6a0471086D705316a',
        name: 'Unknown',
        symbol: 'Unknown',
        decimals: 0,
        logo: null,
        priceUsd: null,
      })
      expect(proxyTokenSpy.calledOnce).to.be.false
    })

    it('should parse properly when to is a token', async () => {
      const action = {
        data: '0x40c10f190000000000000000000000009a5e28a6edcf2f7e050cfbea0e762c0c48cd61cb0000000000000000000000000000000000000000000000056bc75e2d63100000',
        to: '0xe64815dd14662208CBc0E3681c7276942E6b67AC',
        value: '0',
      }

      const decodeAction = new DecodeActions()
      const proxyTokenSpy = sandbox.spy(ProxyToken, 'saveAndGetToken')
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalSupply: '0',
        totalHolders: 0,
      })
      sandbox.stub(CovalentHelper, 'getToken').resolves({})

      const decoded: any = await decodeAction.decodeData(action, {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0xDaoAddress',
        blockNumber: 7639464,
      })

      expect(decoded?.type).to.be.eq(ProposalActionType.Mint)
      expect(decoded?.token).to.deep.eq({
        address: '0xe64815dd14662208CBc0E3681c7276942E6b67AC',
        name: 'MDS TEST TOKEN',
        symbol: 'MDST',
        decimals: 18,
        logo: null,
        priceUsd: '0',
      })

      expect(proxyTokenSpy.calledOnce).to.be.true
    })
  })
})
