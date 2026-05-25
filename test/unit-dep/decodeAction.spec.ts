import CoinGeckoHelper from '@helpers/coinGecko'
import DecodeActions from '@helpers/decodeAction'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum, ProposalActionType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe.only('Integ: decodeAction', () => {
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
  it('should decode properly for the action that has tuple', async () => {
    const actions = [
      {
        to: '0x83DABe7727EEDB1051a51Ea324C8963BCe2C6C63',
        value: '0',
        data: '0x3d4ebc5b00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000697b36080000000000000000000000000000000000000000000000000000000000000012697066733a2f2f746869736973617465737400000000000000000000000000006d65726b6c652d6469737472696275746f722d7374726174656779000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000202921f0bc9bf3e5dd132815642a80a258e282e23e3e449c61d639dcac16530150000000000000000000000000dc2314ce8cd9fe2f9b07e31938dce95fc07b1803000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000',
      },
    ]

    const decodeAction = new DecodeActions()
    const decoded = await decodeAction.decodeData(actions[0], {
      network: NetworksEnum.ethereumSepolia,
      daoAddress: '0xDaoAddress',
      blockNumber: 7639464,
    })
    expect(decoded).to.be.not.undefined
    expect(decoded?.inputData?.parameters).to.be.not.undefined
    expect(decoded?.inputData?.parameters.length).to.be.eq(4)
  })

  it.only('should decode properly for the action that has tuple', async () => {
    const actions = [
      {
        to: '0x290503854c95Bfa44173d68f2E3e5AaFe073e220',
        value: '0',
        data: '0x3d4ebc5b00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035697066733a2f2f516d6464636a6e675642614a6a377538633151576863704a7a44454759707035375048514d47594e784b5762443300000000000000000000006d65726b6c652d6469737472696275746f722d737472617465677900000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020c6901b6d446a1e540a8915cf6435f4953b4dabaa00e87606f1dd1d00b012f18c0000000000000000000000007f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d766f74696e672d657363726f772d6c6f636b2d656e636f646572000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000004d6fc15ca6258b168225d283262743c623c13ead',
      },
    ]
    const decodeAction = new DecodeActions()
    const decoded = await decodeAction.decodeData(actions[0], {
      network: NetworksEnum.ethereumSepolia,
      daoAddress: '0xDaoAddress',
      blockNumber: 7639464,
    })
    expect(decoded).to.be.not.undefined
  })
})
