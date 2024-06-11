import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { UtilsIndexer } from '@indexer/utils/indexer'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'

describe('Model/Utils: indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('saveAndGetToken', () => {
    it('should return existing token if found', async () => {
      const existingToken = { id: 'token123', symbol: 'TKN' }
      sandbox.stub(Models.Token, 'findExistingLog').resolves(existingToken)

      const result = await UtilsIndexer.saveAndGetToken('0x123', NetworksEnum.mainnet)

      expect(result).to.equal(existingToken)
    })

    it('should detect token type and create new token if not found', async () => {
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.ERC20, implementationAddress: '0x456' } as any)
      const stubGetToken = sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: '0x123',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        totalSupply: 2000,
      })

      const token = await UtilsIndexer.saveAndGetToken('0x123', NetworksEnum.mainnet)

      expect(stubFind.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(stubGetToken.calledOnce).to.be.true
      expect(token!.address).to.eq('0x123')
      expect(token!.type).to.eq(ITokenType.ERC20)
      expect(token!.implementationAddress).to.eq('0x456')
      expect(token!.name).to.eq('TokenName')
      expect(token!.decimals).to.eq(18)
      expect(token!.symbol).to.eq('TKN')
      expect(token!.totalSupply).to.eq(2000)
      expect(token!.network).to.eq(NetworksEnum.mainnet)
    })

    it('should detect token type unknown', async () => {
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.unknown } as any)
      const stubGetToken = sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: '0x123',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        totalSupply: 2000,
      })

      const token = await UtilsIndexer.saveAndGetToken('0x123', NetworksEnum.mainnet)

      expect(stubFind.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(stubGetToken.calledOnce).to.be.true
      expect(token!.type).to.eq(ITokenType.unknown)
    })

    it('token not found', async () => {
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(true)
      const token = await UtilsIndexer.saveAndGetToken('0x123', NetworksEnum.mainnet)

      expect(token).to.be.true
      expect(stubFind.calledOnce).to.be.true
    })
  })
})
