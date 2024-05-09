import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import config from '@config'
// import { DaoLogs } from '@services/indexer/daoLogs'
// import { LogDaoRegistry } from '@services/indexer/logDaoRegistry'
// import { LogDao } from '@services/indexer/logDao'
import { LogDao } from '@services/indexer/logDao'
import { InitialData } from '../../initialData'

describe('Manual: Indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    config.BLOCKCHAIN_NODES.MAINNET = 'wss://eth-mainnet.g.alchemy.com/v2/WCcOSca9z2Qo7wnMJz19Wo_yQr5pqv2k'
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('index', async function () {
    ;(this as any).timeout(140000)
    await ProviderModule.connectToAllNetworks()
    await InitialData.start()
    await LogDao.start()
  })

  it('index', async () => {
    await ProviderModule.connectToAllNetworks()
    await InitialData.start()
    await LogDao.start()
  })
})
