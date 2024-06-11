import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ILogInfo, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoHandler } from '@services/aragon-indexer/handlers/daoHandler'
import { Models } from '@dbModels'

describe('Indexer: DaoHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('newURI', () => {
    it('uri updated', async () => {
      const network = NetworksEnum.mainnet
      const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
      const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
      const rawLogDaoRegistry = {
        transactionHash,
        blockNumber: 3,
        network,
        address,
        creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        subdomain: 'fake-subdomain',
      }
      const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
      const event = {
        args: {
          daoURI: 'test',
        },
      }
      const infoLog: ILogInfo = {
        network,
        transactionHash: rawLogDaoRegistry.transactionHash,
        blockNumber: 1,
        address: rawLogDaoRegistry.address,
        eventName: 'test',
      }

      const stubLogger = sandbox.stub(logger, 'verbose')
      const spyFindByAddress = sandbox.spy(Models.LogDaoRegistry, 'findByAddress')

      await DaoHandler.newURI(event as any, infoLog)

      expect(spyFindByAddress.calledOnceWith(infoLog.address, infoLog.network)).to.be.true
      expect(stubLogger.calledOnce).to.be.true

      const updated = await createdLogDaoRegistry.reload()
      expect(updated.uriUpdates.length).to.eq(1)
    })

    it('uri updated - not existing dao', async () => {
      const network = NetworksEnum.mainnet
      const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
      const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
      const rawLogDaoRegistry = {
        transactionHash,
        blockNumber: 3,
        network,
        address,
        creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        subdomain: 'fake-subdomain',
      }
      const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
      const event = {
        args: {
          daoURI: 'test',
        },
      }
      const infoLog: ILogInfo = {
        network,
        transactionHash: rawLogDaoRegistry.transactionHash,
        blockNumber: 1,
        address: rawLogDaoRegistry.address,
        eventName: 'test',
      }

      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns(undefined)

      await DaoHandler.newURI(event as any, infoLog)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('uri updated - missing daoURI', async () => {
      const network = NetworksEnum.mainnet
      const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
      const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
      const rawLogDaoRegistry = {
        transactionHash,
        blockNumber: 3,
        network,
        address,
        creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        subdomain: 'fake-subdomain',
      }
      const event = {
        args: {
          daoURI: undefined,
        },
      }
      const infoLog: ILogInfo = {
        network,
        transactionHash: rawLogDaoRegistry.transactionHash,
        blockNumber: 1,
        address: rawLogDaoRegistry.address,
        eventName: 'test',
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns(undefined)

      await DaoHandler.newURI(event as any, infoLog)

      expect(stubLogger.calledOnceWith('newURI - no daoURI' as any)).to.be.true
    })
  })
})
