import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ILogInfo, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoHandler } from '@services/indexer/handlers/daoHandler'
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
    it('uri updated fails when no uri presented', async () => {
      const network = NetworksEnum.mainnet
      const stubLogger = sandbox.stub(logger, 'verbose')

      const event = {
        args: {
          daoURI: '',
        },
      }

      const findExistingLogStub = sandbox.spy(Models.LogDaoRegistry, 'findExistingLog')

      const infoLog: ILogInfo = {
        network,
        transactionHash: '0x123',
        blockNumber: 1,
        address: '0x456',
        eventName: 'test',
      }

      await DaoHandler.newURI(event as any, infoLog)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('newURI: no daoURI' as any)).to.be.true
      expect(findExistingLogStub.notCalled).to.be.true
    })

    it('should fails when dao not exists', async () => {
      const network = NetworksEnum.mainnet
      const stubLogger = sandbox.stub(logger, 'verbose')
      const event = {
        args: {
          daoURI: 'test',
        },
      }

      const findExistingLogStub = sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').returns(false)
      const findByAddressStub = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns(false)

      const infoLog: ILogInfo = {
        network,
        transactionHash: '0x123',
        blockNumber: 1,
        address: '0x456',
        eventName: 'test',
      }

      await DaoHandler.newURI(event as any, infoLog)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Dao not found' as any)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
    })

    it('uri updated', async () => {
      const network = NetworksEnum.mainnet
      const stubLogger = sandbox.stub(logger, 'verbose')
      const event = {
        args: {
          daoURI: 'test',
        },
      }

      const addURIUpdatesStub = sandbox.stub()
      const findExistingLogStub = sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').returns(false)
      const findByAddressStub = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns({
        addURIUpdates: addURIUpdatesStub,
        address: '0x123',
      })

      const infoLog: ILogInfo = {
        network,
        transactionHash: '0x123',
        blockNumber: 1,
        address: '0x456',
        eventName: 'test',
      }

      await DaoHandler.newURI(event as any, infoLog)

      expect(stubLogger.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(addURIUpdatesStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true

      expect(addURIUpdatesStub.args[0][0]).to.be.deep.eq({
        blockNumber: 1,
        transactionHash: '0x123',
        uri: 'test',
      })
    })
  })
})
