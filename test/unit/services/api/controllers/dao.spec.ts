import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoController from '@services/api/controllers/dao'
import { ItxOpts, NetworksEnum, EnumPluginType } from '@types'
import { Models } from '@dbModels'

describe('Controller: Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('get dao with pagination', async () => {
    const stupReq = sandbox.stub(Models.Dao, 'findWithPagination').resolves({
      data: [{ id: 1, name: 'Test DAO' }],
      currentPage: 1,
      totPages: 1,
      totRecords: 1,
    })

    const params: ItxOpts & {
      network: NetworksEnum
      plugin: EnumPluginType
    } = {
      network: NetworksEnum.ethereum,
      plugin: EnumPluginType.MultisigPlugin,
      search: '',
      toDate: '',
      fromDate: '',
      limit: 10,
      offset: 1,
      order: 'asc',
      orderProp: 'createdAt',
    }

    const response = await DaoController.getWithPagination(params as any)

    expect(stupReq.calledOnce).to.be.true
    expect(
      stupReq.calledWith(
        { networks: [params.network], pluginNames: [params.plugin] },
        {
          search: '',
          toDate: '',
          fromDate: '',
          limit: 10,
          offset: 1,
          order: 'asc',
          orderProp: 'createdAt',
        },
      ),
    ).to.be.true
    expect(response).to.have.property('data').with.lengthOf(1)
    expect(response.data[0]).to.have.property('id', 1)
    expect(response.data[0]).to.have.property('name', 'Test DAO')
    expect(response).to.have.property('currentPage', 1)
    expect(response).to.have.property('totPages', 1)
    expect(response).to.have.property('totRecords', 1)
  })
})
