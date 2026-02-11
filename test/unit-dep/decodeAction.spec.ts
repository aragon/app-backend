import CoinGeckoHelper from '@helpers/coinGecko'
import DecodeActions from '@helpers/decodeAction'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum, ProposalActionType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: decodeAction', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('decode gauge registrar actions', () => {
    it('should parse properly registerGauge action', async () => {
      const action = {
        data: '0x0de61ed00000000000000000000000006818013d7b2d49d7396ba9733b59c539a639f3ed00000000000000000000000000000000000000000000000000000000000000000000000000000000000000006818013d7b2d49d7396ba9733b59c539a639f3ed0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000006c3078363937303636373333613266326635313664363137313637343636663332353936373736376137333738333735343332343635323438356137373334376135333437343436333434333835393638373835323661333637313530333636613462343336313662343233310000000000000000000000000000000000000000',
        to: '0x97BBC8D5F563d2193aE96600bBc787b55458745d',
        value: '0',
      }

      const decodeAction = new DecodeActions()
      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        name: 'Test gauge',
      })

      const decoded: any = await decodeAction.decodeData(action, {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0xDaoAddress',
        blockNumber: 7051636,
      })

      expect(decoded?.type).to.be.eq(ProposalActionType.RegisterGauge)
      expect(decoded?.gaugeMetadata).to.deep.eq({
        name: 'Test gauge',
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
        blockedCountries: [],
        termsConditionsUrl: null,
        enableOfacCheck: null,
      })
      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.args[0][0]).to.eq('ipfs://QmaqgFo2Ygvzsx7T2FRHZw4zSGDcD8YhxRj6qP6jKCakB1')
    })
  })

  describe('decode GaugeVoter actions', () => {
    it('should parse properly createGauge action', async () => {
      const action = {
        data: '0x071d2171000000000000000000000000b8a55fb41ba5e8996f47e2c5e88ef8d4ef5a95a30000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006c3078363937303636373333613266326635313664353235363464353837613333346137363734333935383539373836643532343633373731356134363435333536373338363637333338356137343761353835383533366635383332353134313534373234353464363234330000000000000000000000000000000000000000',
        to: '0x1d8b09B564c931153aDd628187D21085AFf34199',
        value: '0',
      }

      const decodeAction = new DecodeActions()
      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        name: 'Test gauge',
      })

      const decoded: any = await decodeAction.decodeData(action, {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0xDaoAddress',
        blockNumber: 7051636,
      })

      expect(decoded?.type).to.be.eq(ProposalActionType.CreateGauge)
      expect(decoded?.gaugeMetadata).to.deep.eq({
        name: 'Test gauge',
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
        blockedCountries: [],
        termsConditionsUrl: null,
        enableOfacCheck: null,
      })
      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.args[0][0]).to.eq('ipfs://QmRVMXz3Jvt9XYxmRF7qZFE5g8fs8ZtzXXSoX2QATrEMbC')
    })

    it('should parse properly updateGaugeMetadata action', async () => {
      const action = {
        data: '0xad288fe8000000000000000000000000b8a55fb41ba5e8996f47e2c5e88ef8d4ef5a95a30000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006c3078363937303636373333613266326635313664353836323464343633363735373737383536373634313437343737383533353434373333373635383561343137383539363937613739373135343636353633363337346334633735343834313333343733363435373533380000000000000000000000000000000000000000',
        to: '0x1d8b09B564c931153aDd628187D21085AFf34199',
        value: '0',
      }

      const decodeAction = new DecodeActions()
      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        name: 'Test gauge updated',
      })

      const decoded: any = await decodeAction.decodeData(action, {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0xDaoAddress',
        blockNumber: 7051636,
      })

      expect(decoded?.type).to.be.eq(ProposalActionType.UpdateGaugeMetadata)
      expect(decoded?.gaugeMetadata).to.deep.eq({
        name: 'Test gauge updated',
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
        blockedCountries: [],
        termsConditionsUrl: null,
        enableOfacCheck: null,
      })
      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.args[0][0]).to.eq('ipfs://QmXbMF6uwxVvAGGxSTG3vXZAxYizyqTfV67LLuHA3G6Eu8')
    })
  })

  describe.skip('decodeAction when mint is wired data', () => {
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
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({
        totalSupply: '0',
        holders: 0,
      } as any)

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
