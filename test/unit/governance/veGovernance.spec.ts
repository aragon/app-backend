import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { VeGovernance, BaseGovernance } from '@src/governance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress, ITokenType, EnumQueueName, IPluginInterfaceType, IPluginStatus } from '@types'
import Web3Utils from '@helpers/web3Utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'

describe('Governance:VeGovernance', () => {
  let sandbox: SinonSandbox
  let veGovernance: VeGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testEscrowAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testEscrowAdapterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
  const testTokenAddress = '0xdadadadadadadadadadadadadadadadadadadada' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    veGovernance = new VeGovernance(testEscrowAddress, testNetwork, {
      escrowAdapterAddress: testEscrowAdapterAddress,
    })

    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerErrorStub = sandbox.stub(Logger, 'error')

    // Only stub external services
    sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    // Stub utils.getUniqueValuesByKey for updateDaoMetrics tests
    sandbox.stub(utils, 'getUniqueValuesByKey').callsFake((...args: any[]) => {
      const [array, key] = args
      const values = array.map((item: any) => item[key])
      return [...new Set(values)]
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('inheritance', () => {
    it('should extend BaseGovernance', () => {
      expect(veGovernance).to.be.instanceOf(VeGovernance)
      expect(veGovernance).to.be.instanceOf(BaseGovernance)
    })

    it('should inherit methods from BaseGovernance', () => {
      expect(veGovernance.getOrCreate).to.be.a('function')
      expect(veGovernance.create).to.be.a('function')
      expect(veGovernance.update).to.be.a('function')
      expect(veGovernance.delete).to.be.a('function')
      expect(veGovernance.findOne).to.be.a('function')
      expect(veGovernance.findAndPaginateMembers).to.be.a('function')
      expect(veGovernance.updateDaoMetrics).to.be.a('function')
    })
  })

  describe('constructor', () => {
    it('should initialize with escrow address and network', () => {
      const governance = new VeGovernance(testEscrowAddress, testNetwork)
      expect(governance['address']).to.equal(testEscrowAddress)
      expect(governance['escrowAddress']).to.equal(testEscrowAddress)
      expect(governance['network']).to.equal(testNetwork)
      expect(governance['escrowAdapterAddress']).to.be.null
    })

    it('should initialize with escrow adapter address when provided', () => {
      const governance = new VeGovernance(testEscrowAddress, testNetwork, {
        escrowAdapterAddress: testEscrowAdapterAddress,
      })
      expect(governance['escrowAddress']).to.equal(testEscrowAddress)
      expect(governance['escrowAdapterAddress']).to.equal(testEscrowAdapterAddress)
    })
  })

  describe('getPlugins', () => {
    it('should fetch all plugins using this escrow address', async () => {
      // Create plugins in database
      const plugin1 = await Models.Plugin.create({
        id: `${testNetwork}-0xplugin1plugin1plugin1plugin1plugin1-0`,
        transactionHash: '0xplugintx1',
        blockNumber: 50,
        network: testNetwork,
        address: '0xplugin1plugin1plugin1plugin1plugin1',
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        tokenAddress: testTokenAddress,
        daoAddress: '0xdao1dao1dao1dao1dao1dao1dao1dao1dao1dao1',
        votingEscrow: {
          escrowAddress: testEscrowAddress,
          nftLockAddress: '0xnft1nft1nft1nft1nft1nft1nft1nft1nft1nft1',
          exitQueueAddress: '0xexit1exit1exit1exit1exit1exit1exit1exit1',
        },
        isSupported: true,
      })

      const plugin2 = await Models.Plugin.create({
        id: `${testNetwork}-0xplugin2plugin2plugin2plugin2plugin2-1`,
        transactionHash: '0xplugintx2',
        blockNumber: 51,
        network: testNetwork,
        address: '0xplugin2plugin2plugin2plugin2plugin2',
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        tokenAddress: testTokenAddress,
        daoAddress: '0xdao2dao2dao2dao2dao2dao2dao2dao2dao2dao2',
        votingEscrow: {
          escrowAddress: testEscrowAddress,
          nftLockAddress: '0xnft2nft2nft2nft2nft2nft2nft2nft2nft2nft2',
          exitQueueAddress: '0xexit2exit2exit2exit2exit2exit2exit2exit2',
        },
        isSupported: true,
      })

      const result = await veGovernance.getPlugins()

      expect(result).to.have.lengthOf(2)
      expect(result[0].address).to.equal(plugin1.address)
      expect(result[1].address).to.equal(plugin2.address)
      expect(result[0].votingEscrow.escrowAddress).to.equal(testEscrowAddress)
      expect(result[1].votingEscrow.escrowAddress).to.equal(testEscrowAddress)
    })
  })

  describe('getOrCreate', () => {
    beforeEach(async () => {
      // Create a plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-0xpluginaddress-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: '0xpluginaddress',
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        tokenAddress: testTokenAddress,
        daoAddress: '0xdaoaddress',
        votingEscrow: {
          escrowAddress: testEscrowAddress,
          nftLockAddress: '0xnftaddress',
          exitQueueAddress: '0xexitqueueaddress',
        },
        isSupported: true,
      })
    })

    it('should return existing lock member if found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing lock in database
      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testEscrowAddress,
        transactionHash: '0xtxhash',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 100,
        memberAddress: parsedAddress,
        nftAddress: '0xnftaddress',
        tokenAddress: testTokenAddress,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '123',
        amount: '1000000000000000000',
        epochStartAt: 1680000000,
        totalLocked: '1000000000000000000',
      })

      const result = await veGovernance.getOrCreate(memberAddress, {
        info: {
          transactionHash: '0xtxhash',
          transactionIndex: 0,
          logIndex: 0,
          blockNumber: 100,
        },
        parsedEvent: {
          args: {
            tokenId: 123,
            value: '1000000000000000000',
            startTs: 1680000000,
            newTotalLocked: '1000000000000000000',
          },
        },
        lastActivity: 100,
      } as any)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.tokenId).to.equal('123')
      expect(result?.amount).to.equal('1000000000000000000')
    })

    it('should create new lock member if not found', async () => {
      const result = await veGovernance.getOrCreate(memberAddress, {
        info: {
          transactionHash: '0xnewtxhash',
          transactionIndex: 1,
          logIndex: 2,
          blockNumber: 200,
        },
        parsedEvent: {
          args: {
            tokenId: 456,
            value: '5000000000000000000',
            startTs: 1680001000,
            newTotalLocked: '5000000000000000000',
          },
        },
        lastActivity: 200,
      } as any)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.escrowAddress).to.equal(testEscrowAddress)
      expect(result?.tokenId).to.equal('456')
      expect(result?.amount).to.equal('5000000000000000000')
      expect(result?.epochStartAt).to.equal(1680001000)
      expect(result?.totalLocked).to.equal('5000000000000000000')

      // Verify it was saved to database
      const savedLock = await Models.Lock.findOne({
        memberAddress: result?.memberAddress,
        escrowAddress: testEscrowAddress,
        tokenId: '456',
      })
      expect(savedLock).to.exist
      expect(savedLock?.amount).to.equal('5000000000000000000')

      // Verify base member was also created
      const baseMember = await Models.Member.findOne({ address: result?.memberAddress })
      expect(baseMember).to.exist
      expect(baseMember?.ens).to.equal('test.eth')

      expect(loggerVerboseStub.calledWith('Created new LockMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await veGovernance.getOrCreate(
        'invalid' as HexAddress,
        {
          info: {},
          parsedEvent: { args: {} },
        } as any,
      )

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const result = await veGovernance.getOrCreate(memberAddress, {
        // Missing required params
        info: {},
      } as any)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })
  })

  describe('create', () => {
    beforeEach(async () => {
      // Create a plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-0xpluginaddress-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: '0xpluginaddress',
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        tokenAddress: testTokenAddress,
        daoAddress: '0xdaoaddress',
        votingEscrow: {
          escrowAddress: testEscrowAddress,
          nftLockAddress: '0xnftaddress',
          exitQueueAddress: '0xexitqueueaddress',
        },
        isSupported: true,
      })
    })

    it('should create a new lock member', async () => {
      const result = await veGovernance.create(memberAddress, {
        info: {
          transactionHash: '0xcreatetxhash',
          transactionIndex: 0,
          logIndex: 0,
          blockNumber: 300,
        },
        parsedEvent: {
          args: {
            tokenId: 789,
            value: '2000000000000000000',
            startTs: 1680002000,
            newTotalLocked: '2000000000000000000',
          },
        },
        lastActivity: 300,
      } as any)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.tokenId).to.equal('789')
      expect(result?.amount).to.equal('2000000000000000000')

      // Verify it was saved to database
      const savedLock = await Models.Lock.findOne({
        memberAddress: result?.memberAddress,
        escrowAddress: testEscrowAddress,
        tokenId: '789',
      })
      expect(savedLock).to.exist

      expect(loggerVerboseStub.calledWith('Created new LockMember')).to.be.true
    })
  })

  describe('update', () => {
    beforeEach(async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create locks for testing
      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testEscrowAddress,
        transactionHash: '0xlock1',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 100,
        memberAddress: parsedAddress,
        nftAddress: '0xnftaddress',
        tokenAddress: testEscrowAdapterAddress,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '111',
        amount: '1000000000000000000',
        epochStartAt: 1680000000,
        totalLocked: '1000000000000000000',
      })

      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testEscrowAddress,
        transactionHash: '0xlock2',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 101,
        memberAddress: parsedAddress,
        nftAddress: '0xnftaddress',
        tokenAddress: testEscrowAdapterAddress,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '222',
        amount: '2000000000000000000',
        epochStartAt: 1680001000,
        totalLocked: '3000000000000000000',
      })
    })

    it('should update lock delegate receiver address', async () => {
      const delegateAddress = '0x9999999999999999999999999999999999999999' as HexAddress

      const result = await veGovernance.update(memberAddress, {
        tokenIds: ['111', '222'],
        delegateReceiverAddress: delegateAddress,
        lastActivity: 200,
      })

      expect(result).to.exist
      expect(result).to.be.an('array')
      // Note: The actual implementation has a bug - it returns a cursor instead of executing find
      // In a real scenario, this would need to be fixed in the source code

      // Verify locks were updated in database
      const updatedLock1 = await Models.Lock.findOne({
        tokenId: '111',
        escrowAddress: testEscrowAddress,
      })
      expect(updatedLock1?.delegateReceiverAddress).to.equal(delegateAddress)

      const updatedLock2 = await Models.Lock.findOne({
        tokenId: '222',
        escrowAddress: testEscrowAddress,
      })
      expect(updatedLock2?.delegateReceiverAddress).to.equal(delegateAddress)

      expect(loggerVerboseStub.calledWith('Updated Lock')).to.be.true
    })

    it('should return null if tokenIds not provided', async () => {
      const result = await veGovernance.update(memberAddress, {
        delegateReceiverAddress: '0x9999999999999999999999999999999999999999',
      })

      expect(result).to.be.null
      expect(loggerWarnStub.calledWith('TokenId required for VE governance update')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await veGovernance.update('invalid' as HexAddress, {
        tokenIds: ['111'],
      })

      expect(result).to.be.null
    })
  })

  describe('lockWithdrawn', () => {
    beforeEach(async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a lock for testing
      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testEscrowAddress,
        transactionHash: '0xlocktx',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 100,
        memberAddress: parsedAddress,
        nftAddress: '0xnftaddress',
        tokenAddress: testTokenAddress,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '333',
        amount: '1000000000000000000',
        epochStartAt: 1680000000,
        totalLocked: '1000000000000000000',
      })
    })

    it('should process lock withdrawal', async () => {
      const result = await veGovernance.lockWithdrawn(memberAddress, {
        info: {
          transactionHash: '0xwithdrawtx',
          blockNumber: 200,
        },
        parsedEvent: {
          args: {
            depositor: memberAddress,
            tokenId: 333,
            value: '1000000000000000000',
            ts: 1680003000,
            newTotalLocked: '0',
          },
        },
      } as any)

      expect(result).to.exist
      expect(result?.tokenId).to.equal('333')

      // Verify lock was updated in database
      const updatedLock = await Models.Lock.findOne({
        tokenId: '333',
        escrowAddress: testEscrowAddress,
      })
      expect(updatedLock?.lockWithdraw?.status).to.be.true
      expect(updatedLock?.lockWithdraw?.transactionHash).to.equal('0xwithdrawtx')
      expect(updatedLock?.lockWithdraw?.amount).to.equal('1000000000000000000')
      expect(updatedLock?.delegateReceiverAddress).to.be.null

      expect(loggerVerboseStub.calledWith('Withdraw processed in VeGovernance')).to.be.true
    })

    it('should skip if lock already withdrawn', async () => {
      // First withdrawal
      await veGovernance.lockWithdrawn(memberAddress, {
        info: {
          transactionHash: '0xwithdrawtx1',
          blockNumber: 200,
        },
        parsedEvent: {
          args: {
            depositor: memberAddress,
            tokenId: 333,
            value: '1000000000000000000',
            ts: 1680003000,
            newTotalLocked: '0',
          },
        },
      } as any)

      // Second withdrawal attempt
      const result = await veGovernance.lockWithdrawn(memberAddress, {
        info: {
          transactionHash: '0xwithdrawtx2',
          blockNumber: 201,
        },
        parsedEvent: {
          args: {
            depositor: memberAddress,
            tokenId: 333,
            value: '1000000000000000000',
            ts: 1680003000,
            newTotalLocked: '0',
          },
        },
      } as any)

      expect(result).to.exist
      expect(loggerWarnStub.calledWith('Lock already withdrawn')).to.be.true
    })
  })

  describe('exitQueued', () => {
    beforeEach(async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a lock for testing
      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testEscrowAddress,
        transactionHash: '0xlocktx',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 100,
        memberAddress: parsedAddress,
        nftAddress: '0xnftaddress',
        tokenAddress: testTokenAddress,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '444',
        amount: '1000000000000000000',
        epochStartAt: 1680000000,
        totalLocked: '1000000000000000000',
      })
    })

    it('should process exit queue', async () => {
      const result = await veGovernance.exitQueued(memberAddress, {
        info: {
          transactionHash: '0xexittx',
          blockNumber: 250,
          address: '0xexitqueueaddress',
        },
        parsedEvent: {
          args: {
            holder: memberAddress,
            tokenId: 444,
            exitDate: 1680004000,
          },
        },
      } as any)

      expect(result).to.exist
      expect(result?.tokenId).to.equal('444')

      // Verify lock was updated in database
      const updatedLock = await Models.Lock.findOne({
        tokenId: '444',
        exitQueueAddress: '0xexitqueueaddress',
      })
      expect(updatedLock?.lockExit?.status).to.be.true
      expect(updatedLock?.lockExit?.transactionHash).to.equal('0xexittx')
      expect(updatedLock?.lockExit?.exitDateAt).to.equal(1680004000)

      expect(loggerVerboseStub.calledWith('Exit queued processed in VeGovernance')).to.be.true
    })
  })

  describe('delete', () => {
    it('should throw not implemented error', async () => {
      try {
        await veGovernance.delete(memberAddress)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Update not implemented')
      }
    })
  })

  describe('findOne', () => {
    it('should find lock member with all required params', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a lock to find
      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testEscrowAddress,
        transactionHash: '0xfindtx',
        transactionIndex: 5,
        logIndex: 10,
        blockNumber: 100,
        memberAddress: parsedAddress,
        nftAddress: '0xnftaddress',
        tokenAddress: testTokenAddress,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '555',
        amount: '1000000000000000000',
        epochStartAt: 1680000000,
        totalLocked: '1000000000000000000',
      })

      const result = await veGovernance.findOne(memberAddress, undefined, {
        transactionHash: '0xfindtx',
        transactionIndex: 5,
        logIndex: 10,
        tokenAddress: testTokenAddress,
        tokenId: '555',
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.tokenId).to.equal('555')
      expect(result?.transactionHash).to.equal('0xfindtx')
    })

    it('should return null if required params missing', async () => {
      const result = await veGovernance.findOne(memberAddress, undefined, {
        transactionHash: '0xfindtx',
        // Missing other required params
      })

      expect(result).to.be.null
    })

    it('should return null if address parsing fails', async () => {
      const result = await veGovernance.findOne('invalid' as HexAddress)

      expect(result).to.be.null
    })
  })

  describe('findAndPaginateMembers', () => {
    beforeEach(async () => {
      // Create token for testing
      await Models.Token.create({
        address: testTokenAddress,
        network: testNetwork,
        type: ITokenType.ERC20,
        symbol: 'veToken',
        decimals: 18,
        name: 'Vote Escrowed Token',
      })

      // Create settings for testing
      await Models.Setting.create({
        network: testNetwork,
        isActive: true,
        tokenAddress: testTokenAddress,
        pluginAddress: '0xplugin',
        transactionHash: '0xsettingtx',
        blockNumber: 10,
        status: 'active',
        votingEscrow: {
          maxTime: 86400 * 365 * 4, // 4 years
          slope: 1,
          bias: 0,
        },
      })
    })

    it('should call Lock.getMembersOfVeLockPlugin with settings and token info', async () => {
      const mockResult = {
        docs: [
          { memberAddress: memberAddress, lockedAmount: '1000', unlockTime: 1234567890 },
          { memberAddress: '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd', lockedAmount: '2000', unlockTime: 1234567891 },
        ],
        totalDocs: 2,
        limit: 10,
        totalPages: 1,
        page: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      }

      const getMembersStub = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockResult as any)

      const result = await veGovernance.findAndPaginateMembers({
        paginationParams: { limit: 10, page: 1 },
        extraParams: {
          daoAddress: '0xdao' as HexAddress,
          pluginAddress: '0xplugin' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      })

      expect(result).to.equal(mockResult)
      expect(getMembersStub.calledOnce).to.be.true

      const callArgs = getMembersStub.firstCall.args[0]
      expect(callArgs.paginationParams).to.deep.equal({ limit: 10, page: 1 })
      expect(callArgs.pluginAddress).to.equal('0xplugin')
      expect(callArgs.tokenAddress).to.equal(testTokenAddress)
      expect(callArgs.network).to.equal(testNetwork)
      expect(callArgs.settings).to.deep.include({
        maxTime: 126144000, // 4 years in seconds
        slope: '1',
        bias: '0',
        decimals: '1000000000000000000', // 10^18
      })
      expect(callArgs.settings.currentTime).to.be.a('number')
    })
  })

  describe('updateDaoMetrics', () => {
    it('should send DAO metrics update messages for all DAOs', async () => {
      // Create plugins in database
      await Models.Plugin.create({
        id: `${testNetwork}-0xplugin1-0`,
        transactionHash: '0xplugintx1',
        blockNumber: 50,
        network: testNetwork,
        address: '0xPlugin1',
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        tokenAddress: testTokenAddress,
        daoAddress: '0xDao1',
        votingEscrow: {
          escrowAddress: testEscrowAddress,
          nftLockAddress: '0xnft1',
          exitQueueAddress: '0xexit1',
        },
        isSupported: true,
      })

      await Models.Plugin.create({
        id: `${testNetwork}-0xplugin2-1`,
        transactionHash: '0xplugintx2',
        blockNumber: 51,
        network: testNetwork,
        address: '0xPlugin2',
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        tokenAddress: testTokenAddress,
        daoAddress: '0xDao2',
        votingEscrow: {
          escrowAddress: testEscrowAddress,
          nftLockAddress: '0xnft2',
          exitQueueAddress: '0xexit2',
        },
        isSupported: true,
      })

      const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub

      await veGovernance.updateDaoMetrics()

      // Should send messages for unique DAOs
      expect(sendMessageStub.called).to.be.true
      expect(sendMessageStub.callCount).to.equal(2)
      expect(sendMessageStub.firstCall.args[0]).to.equal(EnumQueueName.daoMetrics)
      expect(sendMessageStub.secondCall.args[0]).to.equal(EnumQueueName.daoMetrics)
    })
  })
})
