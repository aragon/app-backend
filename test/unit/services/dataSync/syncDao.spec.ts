import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { SyncDao } from '@services/dataSync/syncDao'

describe.skip('Services: IPFS pin metadata', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should fetch', async function () {
    // (this as any).timeout(40 * 60 * 1000)

    // const res = await DuneHelper.getDaos();
    // console.log(res);

    await SyncDao.fetchAll()
  })
})
