import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DataSync from '@services/dataSync/index'
import { SyncDao } from '@services/dataSync/syncDao'
import config from '@config'
import utils from '@helpers/utils'
import logger from '@logger'
import { SyncToken } from '@services/dataSync/syncToken'
import { EnumConnection } from '@types'

describe('DataSync: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should start wallets fetchers & repeat', async () => {
    expect(DataSync.NEED_CONNECTIONS).to.be.deep.eq([EnumConnection.MONGODB])

    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 200

    const fetchDaos = sandbox.stub(SyncDao, 'fetchAll').resolves()

    await DataSync.start()
    DataSync.repeaters.test = 'test1'
    await utils.wait(100)

    expect(typeof DataSync.repeaters.daos).to.eq('function')

    await utils.wait(200)

    expect(fetchDaos.calledTwice).to.be.true

    await DataSync.stop()
    await utils.wait(200)

    expect(DataSync.repeaters.daos).not.to.exist
    expect(fetchDaos.calledTwice).to.be.true

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
  })

  it('Should Sync dao error', async () => {
    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 100

    const stubLogger = sandbox.stub(logger, 'error')
    const testError = new Error('Test fetchAll error')
    sandbox.stub(SyncToken, 'fetchAll').resolves(true as any)
    sandbox.stub(SyncDao, 'fetchAll').rejects(testError)

    await DataSync.start()

    expect(stubLogger.calledOnce).to.be.true
    expect(stubLogger.calledWith('Sync dao error' as any)).to.be.true
    await DataSync.stop()
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
  })

  it('Should Sync token error', async () => {
    const configBk = config.SERVICES.SYNC_DATA.TOKEN_INTERVAL
    config.SERVICES.SYNC_DATA.TOKEN_INTERVAL = 100

    const stubLogger = sandbox.stub(logger, 'error')
    const testError = new Error('Test fetchAll error')
    sandbox.stub(SyncToken, 'fetchAll').rejects(testError)
    sandbox.stub(SyncDao, 'fetchAll').resolves(true as any)

    await DataSync.start()

    console.log(stubLogger.args)
    expect(stubLogger.calledOnce).to.be.true
    expect(stubLogger.calledWith('Sync token error' as any)).to.be.true
    await DataSync.stop()
    config.SERVICES.SYNC_DATA.TOKEN_INTERVAL = configBk
  })
})
