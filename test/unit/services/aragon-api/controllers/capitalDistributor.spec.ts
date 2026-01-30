import { Models } from '@dbModels'
import * as errors from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import EIP712AuthModule, { EIP712ActionType } from '@modules/eip712Auth'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { MemberGovernanceFactory } from '@src/governance'
import {
  CampaignPrepareProgress,
  CampaignPrepareStatus,
  EnumQueueName,
  ErrorKeyEnum,
  HexAddress,
  IClaimStat,
  IPluginInterfaceType,
  IUserCampaignStatus,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: CapitalDistributor', () => {
  let sandbox: SinonSandbox

  const mockParams = {
    pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
    network: NetworksEnum.ethereumMainnet,
    userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getCampaignsWithPagination', () => {
    it('Should get campaigns with pagination successfully', async () => {
      const mockResult = {
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 2,
        },
        data: [
          {
            campaignId: 'campaign-001',
            title: 'Test Campaign 1',
            description: 'Description 1',
            active: true,
            startTime: 1640995200,
            endTime: 1672531200,
            claimCount: 5,
            strategy: { root: '0xmerkleroot123' },
            token: {
              symbol: 'TEST',
              name: 'Test Token',
              decimals: 18,
            },
            userData: {
              status: IClaimStat.CLAIMABLE,
              totalAmount: '1000000000000000000',
              totalClaimed: '0',
            },
          },
          {
            campaignId: 'campaign-002',
            title: 'Test Campaign 2',
            description: 'Description 2',
            active: true,
            startTime: 1640995300,
            endTime: 1672531300,
            claimCount: 2,
            strategy: { root: '' },
            token: {
              symbol: 'TEST',
              name: 'Test Token',
              decimals: 18,
            },
            userData: {
              status: IClaimStat.CLAIMED,
              totalAmount: '2000000000000000000',
              totalClaimed: '2000000000000000000',
            },
          },
        ],
      }

      const campaignStub = sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').resolves(mockResult as any)

      const paginationParams = {
        page: 1,
        pageSize: 10,
        sort: 'startTime',
        order: 'desc',
      }

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        userAddress: mockParams.userAddress,
        status: IClaimStat.CLAIMABLE,
      }

      const result = await CapitalDistributorController.getCampaignsWithPagination(paginationParams, extraParams)

      expect(result).to.deep.eq(mockResult)
      expect(campaignStub.calledOnce).to.be.true
      expect(campaignStub.args[0][0]).to.deep.eq({
        paginationParams,
        params: extraParams,
      })
    })

    it('Should throw error when pluginAddress is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.badParams))

      const extraParams = {
        network: mockParams.network,
        userAddress: mockParams.userAddress,
      }

      await expect(CapitalDistributorController.getCampaignsWithPagination({}, extraParams as any)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.badParams,
      )

      expect(assertStub.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should throw error when network is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().throws(new Error(ErrorKeyEnum.badParams)) // network check fails

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        userAddress: mockParams.userAddress,
      }

      await expect(CapitalDistributorController.getCampaignsWithPagination({}, extraParams as any)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.badParams,
      )

      expect(assertStub.calledTwice).to.be.true
      expect(assertStub.secondCall.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should work without optional userAddress parameter', async () => {
      const mockResult = {
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 1,
        },
        data: [
          {
            campaignId: 'campaign-001',
            title: 'Test Campaign',
            description: 'Description',
            active: true,
            startTime: 1640995200,
            endTime: 1672531200,
            claimCount: 0,
            strategy: { root: '' },
            token: {
              symbol: 'TEST',
              name: 'Test Token',
              decimals: 18,
            },
          },
        ],
      }

      const campaignStub = sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').resolves(mockResult as any)

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      const result = await CapitalDistributorController.getCampaignsWithPagination({}, extraParams)

      expect(result).to.deep.eq(mockResult)
      expect(campaignStub.calledOnce).to.be.true
    })

    it('Should handle and rethrow errors from Campaign model', async () => {
      const campaignError = new Error('Database connection failed')
      sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').rejects(campaignError)

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      await expect(CapitalDistributorController.getCampaignsWithPagination({}, extraParams)).to.be.rejectedWith(
        'Database connection failed',
      )
    })

    it('Should use default empty objects when no parameters provided', async () => {
      const mockResult = {
        metadata: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 },
        data: [],
      }

      sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').resolves(mockResult as any)
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(CapitalDistributorController.getCampaignsWithPagination({} as any, {} as any)).to.be.rejectedWith(
        ErrorKeyEnum.badParams,
      )

      expect(assertStub.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })
  })

  describe('getUserCampaignStatus', () => {
    it('Should get user campaign status successfully', async () => {
      const mockResult: IUserCampaignStatus = {
        totalClaimed: '1500000000000000000',
        totalClaimable: '2500000000000000000',
      }

      const campaignRewardStub = sandbox.stub(Models.CampaignReward, 'getUserCampaignStatus').resolves(mockResult)

      const result = await CapitalDistributorController.getUserCampaignStatus(
        mockParams.pluginAddress,
        mockParams.network,
        mockParams.userAddress,
      )

      expect(result).to.deep.eq(mockResult)
      expect(campaignRewardStub.calledOnce).to.be.true
      expect(campaignRewardStub.args[0][0]).to.eq(mockParams.pluginAddress)
      expect(campaignRewardStub.args[0][1]).to.eq(mockParams.network)
      expect(campaignRewardStub.args[0][2]).to.eq(mockParams.userAddress)
    })

    it('Should throw error when pluginAddress is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          '' as HexAddress,
          mockParams.network,
          mockParams.userAddress,
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)

      expect(assertStub.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should throw error when network is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          mockParams.pluginAddress,
          '' as NetworksEnum,
          mockParams.userAddress,
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)

      expect(assertStub.calledTwice).to.be.true
      expect(assertStub.secondCall.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should throw error when userAddress is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().returns(true as any)
      assertStub.onThirdCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          mockParams.pluginAddress,
          mockParams.network,
          '' as HexAddress,
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)

      expect(assertStub.calledThrice).to.be.true
      expect(assertStub.thirdCall.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should handle and rethrow errors from CampaignReward model', async () => {
      const modelError = new Error('Database query failed')
      sandbox.stub(Models.CampaignReward, 'getUserCampaignStatus').rejects(modelError)

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          mockParams.pluginAddress,
          mockParams.network,
          mockParams.userAddress,
        ),
      ).to.be.rejectedWith('Database query failed')
    })
  })

  describe('getUserCampaignReward', () => {
    const testCampaignId = 'test-campaign-123'
    let mockGovernance: any
    let factoryStub: sinon.SinonStub

    beforeEach(() => {
      mockGovernance = {
        getUserCampaignReward: sandbox.stub(),
      }
      factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance)
    })

    it('should get user campaign reward via governance factory', async () => {
      const expectedResult = {
        exists: true,
        campaignId: testCampaignId,
        userAddress: mockParams.userAddress,
        amount: '1000',
        totalClaimed: '500',
        claims: [
          {
            claimedAmount: '500',
            transactionHash: '0xabc',
            blockNumber: 123,
            blockTimestamp: 1640995200,
          },
        ],
        proof: ['0x123'],
        leaf: '0xleaf',
        isFullyClaimed: false,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      mockGovernance.getUserCampaignReward.resolves(expectedResult)

      const result = await CapitalDistributorController.getUserCampaignReward({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        userAddress: mockParams.userAddress,
        campaignId: testCampaignId,
      })

      expect(result).to.deep.equal(expectedResult)
      expect(factoryStub.calledOnce).to.be.true
      expect(factoryStub.args[0][0]).to.deep.equal({
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      })
      expect(
        mockGovernance.getUserCampaignReward.calledWith({
          campaignId: testCampaignId,
          userAddress: mockParams.userAddress,
        }),
      ).to.be.true
    })

    it('should return exists: false for non-existing reward', async () => {
      const expectedResult = {
        exists: false,
        campaignId: testCampaignId,
        userAddress: mockParams.userAddress,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      mockGovernance.getUserCampaignReward.resolves(expectedResult)

      const result = await CapitalDistributorController.getUserCampaignReward({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        userAddress: mockParams.userAddress,
        campaignId: testCampaignId,
      })

      expect(result).to.deep.equal(expectedResult)
      expect(result.exists).to.be.false
    })

    it('should handle governance errors gracefully', async () => {
      mockGovernance.getUserCampaignReward.rejects(new Error('Governance error'))

      await expect(
        CapitalDistributorController.getUserCampaignReward({
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
          userAddress: mockParams.userAddress,
          campaignId: testCampaignId,
        }),
      ).to.be.rejectedWith('Governance error')
    })
  })

  describe('getPrepareMessage', () => {
    const testDaoAddress = '0xDAO1234567890123456789012345678901234567' as HexAddress

    it('should return typed data for valid DAO', async () => {
      const mockDao = { address: testDaoAddress, network: mockParams.network }
      const mockTypedData = {
        domain: { name: 'Aragon Campaign', version: '1', chainId: 1 },
        types: { PrepareCampaign: [] },
        primaryType: 'PrepareCampaign',
        message: {
          action: EIP712ActionType.prepareCampaign,
          daoAddress: testDaoAddress,
          nonce: 'test-nonce',
          expiresAt: 123456,
        },
      }
      const mockNonce = 'test-nonce'
      const mockExpiresAt = 123456

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao as any)
      sandbox.stub(EIP712AuthModule, 'generateMessage').resolves({
        typedData: mockTypedData as any,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      })

      const result = await CapitalDistributorController.getPrepareMessage({
        daoAddress: testDaoAddress,
        network: mockParams.network,
      })

      expect(result.typedData).to.deep.equal(mockTypedData)
      expect(result.nonce).to.equal(mockNonce)
      expect(result.expiresAt).to.equal(mockExpiresAt)
    })

    it('should throw notFound when DAO does not exist', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        CapitalDistributorController.getPrepareMessage({
          daoAddress: testDaoAddress,
          network: mockParams.network,
        }),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true
    })
  })

  describe('prepareCampaignFromGauge', () => {
    const testDaoAddress = '0xDAO1234567890123456789012345678901234567' as HexAddress
    const testGaugePluginAddress = '0xGauge12345678901234567890123456789012345' as HexAddress
    const testCapitalDistributorAddress = '0xCapital123456789012345678901234567890123' as HexAddress
    const testTokenAddress = '0xToken12345678901234567890123456789012345' as HexAddress
    const testSignerAddress = '0xSigner1234567890123456789012345678901234' as HexAddress

    const validParams = {
      daoAddress: testDaoAddress,
      network: NetworksEnum.ethereumMainnet,
      gaugePluginAddress: testGaugePluginAddress,
      capitalDistributorAddress: testCapitalDistributorAddress,
      tokenAddress: testTokenAddress,
      totalAmount: '1000000000000000000',
      metadataUri: 'ipfs://QmTest',
      nonce: 'test-nonce',
      signature: '0xsignature',
    }

    it('should create campaign prepare and send to queue', async () => {
      sandbox.stub(EIP712AuthModule, 'verifyAndConsume').resolves({ valid: true, signer: testSignerAddress })
      sandbox.stub(EIP712AuthModule, 'checkMultisigMember').resolves({ authorized: true })
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: testDaoAddress } as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves({ address: testGaugePluginAddress } as any)

      const mockCampaignPrepare = {
        id: 'prepare-test-123',
        status: CampaignPrepareStatus.pending,
      }
      sandbox.stub(Models.CampaignPrepare, 'create').resolves(mockCampaignPrepare as any)

      const rabbitStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const result = await CapitalDistributorController.prepareCampaignFromGauge(validParams)

      expect(result.prepareId).to.equal('prepare-test-123')
      expect(result.status).to.equal(CampaignPrepareStatus.pending)
      expect(rabbitStub.calledOnce).to.be.true
      expect(rabbitStub.firstCall.args[0]).to.equal(EnumQueueName.prepareCampaignFromGauge)
    })

    it('should throw unauthorized when signature is invalid', async () => {
      sandbox.stub(EIP712AuthModule, 'verifyAndConsume').resolves({ valid: false, error: 'Invalid signature' })
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.unauthorized))

      await expect(CapitalDistributorController.prepareCampaignFromGauge(validParams)).to.be.rejectedWith(
        ErrorKeyEnum.unauthorized,
      )

      expect(assertStub.calledWith(false, ErrorKeyEnum.unauthorized)).to.be.true
    })

    it('should throw unauthorized when signer is not multisig member', async () => {
      sandbox.stub(EIP712AuthModule, 'verifyAndConsume').resolves({ valid: true, signer: testSignerAddress })
      sandbox.stub(EIP712AuthModule, 'checkMultisigMember').resolves({ authorized: false, error: 'Not a member' })
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().throws(new Error(ErrorKeyEnum.unauthorized))

      await expect(CapitalDistributorController.prepareCampaignFromGauge(validParams)).to.be.rejectedWith(
        ErrorKeyEnum.unauthorized,
      )

      expect(assertStub.secondCall.calledWith(false, ErrorKeyEnum.unauthorized)).to.be.true
    })

    it('should throw badParams when totalAmount is zero', async () => {
      sandbox.stub(EIP712AuthModule, 'verifyAndConsume').resolves({ valid: true, signer: testSignerAddress })
      sandbox.stub(EIP712AuthModule, 'checkMultisigMember').resolves({ authorized: true })
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().returns(true as any)
      assertStub.onThirdCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.prepareCampaignFromGauge({
          ...validParams,
          totalAmount: '0',
        }),
      ).to.be.rejectedWith(ErrorKeyEnum.badParams)
    })

    it('should throw notFound when DAO does not exist', async () => {
      sandbox.stub(EIP712AuthModule, 'verifyAndConsume').resolves({ valid: true, signer: testSignerAddress })
      sandbox.stub(EIP712AuthModule, 'checkMultisigMember').resolves({ authorized: true })
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      sandbox.stub(Models.Plugin, 'findOne').resolves({ address: testGaugePluginAddress } as any)

      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onCall(0).returns(true as any) // valid signature
      assertStub.onCall(1).returns(true as any) // authorized member
      assertStub.onCall(2).returns(true as any) // totalAmount > 0
      assertStub.onCall(3).throws(new Error(ErrorKeyEnum.notFound)) // dao not found

      await expect(CapitalDistributorController.prepareCampaignFromGauge(validParams)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })
  })

  describe('getPrepareStatus', () => {
    const testPrepareId = 'prepare-test-123'

    it('should return prepare status with all fields', async () => {
      const mockPrepare = {
        id: testPrepareId,
        status: CampaignPrepareStatus.completed,
        progress: CampaignPrepareProgress.done,
        daoAddress: '0xDAO1234567890123456789012345678901234567',
        network: NetworksEnum.ethereumMainnet,
        capitalDistributorAddress: '0xCapital123456789012345678901234567890123',
        gaugePluginAddress: '0xGauge12345678901234567890123456789012345',
        tokenAddress: '0xToken12345678901234567890123456789012345',
        totalAmount: '1000000000000000000',
        totalMembers: 100,
        merkleRoot: '0xmerkleroot123',
        metadataUri: 'ipfs://QmTest',
      }

      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(mockPrepare as any)

      const result = await CapitalDistributorController.getPrepareStatus(testPrepareId)

      expect(result.prepareId).to.equal(testPrepareId)
      expect(result.status).to.equal(CampaignPrepareStatus.completed)
      expect(result.progress).to.equal(CampaignPrepareProgress.done)
      expect(result.daoAddress).to.equal(mockPrepare.daoAddress)
      expect(result.merkleRoot).to.equal(mockPrepare.merkleRoot)
      expect(result.totalMembers).to.equal(100)
    })

    it('should throw notFound when prepare does not exist', async () => {
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(CapitalDistributorController.getPrepareStatus(testPrepareId)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true
    })
  })
})
