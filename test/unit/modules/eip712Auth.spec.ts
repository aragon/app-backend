import { Models } from '@dbModels'
import EIP712AuthModule, { EIP712ActionType, type IEIP712TypedData } from '@modules/eip712Auth'
import ProviderModule from '@modules/provider'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: eip712Auth', () => {
  let sandbox: SinonSandbox

  const TEST_DAO_ADDRESS = '0x1234567890123456789012345678901234567890'
  const TEST_NETWORK = NetworksEnum.ethereumMainnet
  const TEST_CHAIN_ID = 1
  const TEST_NONCE = 'test-nonce-uuid'
  const TEST_EXPIRES_AT = Date.now() + 300000

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getDomain', () => {
    it('should return correct domain with chainId', () => {
      sandbox.stub(ProviderModule, 'getChainId').returns(TEST_CHAIN_ID)

      const domain = EIP712AuthModule.getDomain(TEST_NETWORK)

      expect(domain).to.deep.equal({
        name: 'Aragon Campaign',
        version: '1',
        chainId: TEST_CHAIN_ID,
      })
    })

    it('should use correct chainId for different networks', () => {
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId')
      getChainIdStub.withArgs(NetworksEnum.ethereumMainnet).returns(1)
      getChainIdStub.withArgs(NetworksEnum.polygonMainnet).returns(137)

      const ethDomain = EIP712AuthModule.getDomain(NetworksEnum.ethereumMainnet)
      expect(ethDomain.chainId).to.equal(1)

      const polyDomain = EIP712AuthModule.getDomain(NetworksEnum.polygonMainnet)
      expect(polyDomain.chainId).to.equal(137)
    })
  })

  describe('buildTypedData', () => {
    beforeEach(() => {
      sandbox.stub(ProviderModule, 'getChainId').returns(TEST_CHAIN_ID)
    })

    it('should build correct typed data structure', () => {
      const typedData = EIP712AuthModule.buildTypedData({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(typedData.domain).to.deep.equal({
        name: 'Aragon Campaign',
        version: '1',
        chainId: TEST_CHAIN_ID,
      })
      expect(typedData.primaryType).to.equal('PrepareCampaign')
      expect(typedData.types).to.have.property('PrepareCampaign')
      expect(typedData.message).to.deep.equal({
        action: EIP712ActionType.prepareCampaign,
        daoAddress: TEST_DAO_ADDRESS,
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
      })
    })

    it('should include correct type definitions', () => {
      const typedData = EIP712AuthModule.buildTypedData({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(typedData.types.PrepareCampaign).to.deep.equal([
        { name: 'action', type: 'string' },
        { name: 'daoAddress', type: 'address' },
        { name: 'nonce', type: 'string' },
        { name: 'expiresAt', type: 'uint256' },
      ])
    })
  })

  describe('recoverSigner', () => {
    const testWallet = Wallet.createRandom()

    beforeEach(() => {
      sandbox.stub(ProviderModule, 'getChainId').returns(TEST_CHAIN_ID)
    })

    it('should recover correct signer from valid signature', async () => {
      const typedData = EIP712AuthModule.buildTypedData({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
        action: EIP712ActionType.prepareCampaign,
      })

      const signature = await testWallet.signTypedData(typedData.domain, typedData.types, typedData.message)

      const recoveredSigner = EIP712AuthModule.recoverSigner({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
        action: EIP712ActionType.prepareCampaign,
        signature,
      })

      expect(recoveredSigner.toLowerCase()).to.equal(testWallet.address.toLowerCase())
    })

    it('should throw error for invalid signature', () => {
      const invalidSignature = '0x' + '00'.repeat(65)

      expect(() =>
        EIP712AuthModule.recoverSigner({
          daoAddress: TEST_DAO_ADDRESS,
          network: TEST_NETWORK,
          nonce: TEST_NONCE,
          expiresAt: TEST_EXPIRES_AT,
          action: EIP712ActionType.prepareCampaign,
          signature: invalidSignature,
        }),
      ).to.throw()
    })
  })

  describe('generateMessage', () => {
    beforeEach(() => {
      sandbox.stub(ProviderModule, 'getChainId').returns(TEST_CHAIN_ID)
    })

    it('should generate nonce and return typed data', async () => {
      const mockNonceDoc = {
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
      }

      sandbox.stub(Models.SignatureNonce, 'generate').resolves(mockNonceDoc as any)

      const result = await EIP712AuthModule.generateMessage({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.nonce).to.equal(TEST_NONCE)
      expect(result.expiresAt).to.equal(TEST_EXPIRES_AT)
      expect(result.typedData).to.be.an('object')
      expect(result.typedData.message.nonce).to.equal(TEST_NONCE)
      expect(result.typedData.message.expiresAt).to.equal(TEST_EXPIRES_AT)
    })

    it('should call SignatureNonce.generate with correct params', async () => {
      const generateStub = sandbox.stub(Models.SignatureNonce, 'generate').resolves({
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
      } as any)

      await EIP712AuthModule.generateMessage({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(generateStub.calledOnce).to.be.true
      expect(generateStub.firstCall.args[0]).to.deep.equal({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
      })
    })
  })

  describe('verifyAndConsume', () => {
    const testWallet = Wallet.createRandom()
    let validSignature: string
    let typedData: IEIP712TypedData

    beforeEach(async () => {
      sandbox.stub(ProviderModule, 'getChainId').returns(TEST_CHAIN_ID)

      typedData = EIP712AuthModule.buildTypedData({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        expiresAt: TEST_EXPIRES_AT,
        action: EIP712ActionType.prepareCampaign,
      })

      validSignature = await testWallet.signTypedData(typedData.domain, typedData.types, typedData.message)
    })

    it('should return valid result with signer for valid signature', async () => {
      const mockNonceDoc = {
        nonce: TEST_NONCE,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
        expiresAt: TEST_EXPIRES_AT,
      }
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves(mockNonceDoc as any)
      sandbox.stub(Models.SignatureNonce, 'consumeNonce').resolves(mockNonceDoc as any)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: validSignature,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.true
      expect(result.signer?.toLowerCase()).to.equal(testWallet.address.toLowerCase())
      expect(result.error).to.be.undefined
    })

    it('should return error for invalid nonce', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves(null)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: 'invalid-nonce',
        signature: validSignature,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.false
      expect(result.error).to.equal('Invalid, expired, or already used nonce')
    })

    it('should return error when daoAddress does not match', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves({
        nonce: TEST_NONCE,
        daoAddress: '0xdifferentdaoaddress1234567890123456789012',
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
        expiresAt: TEST_EXPIRES_AT,
      } as any)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: validSignature,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.false
      expect(result.error).to.equal('Nonce does not match daoAddress')
    })

    it('should return error when network does not match', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves({
        nonce: TEST_NONCE,
        daoAddress: TEST_DAO_ADDRESS,
        network: NetworksEnum.polygonMainnet,
        action: EIP712ActionType.prepareCampaign,
        expiresAt: TEST_EXPIRES_AT,
      } as any)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: validSignature,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.false
      expect(result.error).to.equal('Nonce does not match network')
    })

    it('should return error when action does not match', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves({
        nonce: TEST_NONCE,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: 'DIFFERENT_ACTION',
        expiresAt: TEST_EXPIRES_AT,
      } as any)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: validSignature,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.false
      expect(result.error).to.equal('Nonce does not match action')
    })

    it('should return error for invalid signature', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves({
        nonce: TEST_NONCE,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
        expiresAt: TEST_EXPIRES_AT,
      } as any)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: '0x' + '00'.repeat(65),
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.false
      expect(result.error).to.equal('Invalid signature')
    })

    it('should not consume nonce when signature verification fails', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves({
        nonce: TEST_NONCE,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
        expiresAt: TEST_EXPIRES_AT,
      } as any)
      const consumeStub = sandbox.stub(Models.SignatureNonce, 'consumeNonce')

      await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: '0x' + '00'.repeat(65),
        action: EIP712ActionType.prepareCampaign,
      })

      expect(consumeStub.called).to.be.false
    })

    it('should return error when nonce consumption fails after signature verification', async () => {
      sandbox.stub(Models.SignatureNonce, 'findValidNonce').resolves({
        nonce: TEST_NONCE,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        action: EIP712ActionType.prepareCampaign,
        expiresAt: TEST_EXPIRES_AT,
      } as any)
      sandbox.stub(Models.SignatureNonce, 'consumeNonce').resolves(null)

      const result = await EIP712AuthModule.verifyAndConsume({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        nonce: TEST_NONCE,
        signature: validSignature,
        action: EIP712ActionType.prepareCampaign,
      })

      expect(result.valid).to.be.false
      expect(result.error).to.equal('Invalid, expired, or already used nonce')
    })
  })

  describe('checkMultisigMember', () => {
    const TEST_SIGNER = '0xsigner12345678901234567890123456789012'
    const TEST_PLUGIN_ADDRESS = '0xplugin12345678901234567890123456789012'

    it('should return authorized for valid multisig member', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: TEST_PLUGIN_ADDRESS,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        interfaceType: IPluginInterfaceType.multisig,
      } as any)

      sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves({
        memberAddress: TEST_SIGNER,
        pluginAddress: TEST_PLUGIN_ADDRESS,
      } as any)

      const result = await EIP712AuthModule.checkMultisigMember({
        signer: TEST_SIGNER,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
      })

      expect(result.authorized).to.be.true
      expect(result.error).to.be.undefined
    })

    it('should return error when DAO has no multisig plugin', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      const result = await EIP712AuthModule.checkMultisigMember({
        signer: TEST_SIGNER,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
      })

      expect(result.authorized).to.be.false
      expect(result.error).to.equal('DAO does not have a multisig plugin')
    })

    it('should return error when signer is not a multisig member', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: TEST_PLUGIN_ADDRESS,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        interfaceType: IPluginInterfaceType.multisig,
      } as any)

      sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves(null)

      const result = await EIP712AuthModule.checkMultisigMember({
        signer: TEST_SIGNER,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
      })

      expect(result.authorized).to.be.false
      expect(result.error).to.equal('Signer is not a multisig member')
    })

    it('should query Plugin with correct parameters', async () => {
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await EIP712AuthModule.checkMultisigMember({
        signer: TEST_SIGNER,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
      })

      expect(findOneStub.calledOnce).to.be.true
      expect(findOneStub.firstCall.args[0]).to.deep.equal({
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
        interfaceType: IPluginInterfaceType.multisig,
      })
    })

    it('should query PluginMember with correct parameters', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: TEST_PLUGIN_ADDRESS,
      } as any)

      const findByPluginAndMemberStub = sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves(null)

      await EIP712AuthModule.checkMultisigMember({
        signer: TEST_SIGNER,
        daoAddress: TEST_DAO_ADDRESS,
        network: TEST_NETWORK,
      })

      expect(findByPluginAndMemberStub.calledOnce).to.be.true
      expect(findByPluginAndMemberStub.firstCall.args).to.deep.equal([TEST_NETWORK, TEST_PLUGIN_ADDRESS, TEST_SIGNER])
    })
  })

  describe('EIP712ActionType enum', () => {
    it('should have prepareCampaign action', () => {
      expect(EIP712ActionType.prepareCampaign).to.equal('PREPARE_CAMPAIGN')
    })
  })
})
