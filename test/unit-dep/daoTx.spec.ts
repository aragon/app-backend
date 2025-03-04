import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { Models } from '@dbModels'
import { expect } from 'chai'
describe('Dao Tx', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should get the token details of from the alchemy', async () => {
    const dao = {
      address: '0x779a3Ac6a8D7736e858A2DB4f7A874042c744dd5',
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 18272286,
    }

    sandbox.stub(Models.Dao, 'findByAddress').resolves(dao)
    await DaoTransactions.start({ daoAddress: dao.address, network: dao.network })

    const daoDb = await Models.Transaction.find({
      daoAddress: dao.address,
      network: dao.network,
    })

    expect(daoDb.length).to.be.gt(0)
  })

  it('should get the token details of from the subscan', async function () {
    this.timeout(1000000)
    const address = '0xb3de3b6ac5f8e7b41b834c1509fdd0e56887c9b0'
    const network = NetworksEnum.peaqMainnet
    const blockNumber = 18272286

    sandbox.stub(Models.Dao, 'findByAddress').resolves({ address, network, blockNumber })

    await DaoTransactions.start({ daoAddress: address, network })

    const daoDb = await Models.Transaction.find({
      daoAddress: address,
      network: network,
    })

    expect(daoDb.length).to.be.gt(0)
  })
})
