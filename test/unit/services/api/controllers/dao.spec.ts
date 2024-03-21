import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoController from '@services/api/controllers/dao'
import { EnumPluginType, HexAddress, ItxOpts, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { DaoList } from '@test/mock/fakeDao'
import Satsuma from '@helpers/satsuma'

describe('Controller: Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('get daos with pagination', async () => {
    const stupReq = sandbox.stub(Models.Dao, 'findWithPagination').resolves({
      data: [
        { id: 1, name: 'Test DAO', filterKeys: () => ({ name: 'Test DAO' }) },
      ],
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
        { networks: [params.network], pluginTypes: [params.plugin] },
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
    expect(response.data[0].name).to.eq('Test DAO')
    expect(response.currentPage).to.eq(1)
    expect(response.totPages).to.eq(1)
    expect(response.totRecords).to.eq(1)
  })

  it('get dao', async () => {

    const mockDao = DaoList[1]
    const dbDao = await Models.Dao.create(mockDao)

    const dao = await DaoController.getDao(dbDao.network, dbDao.daoAddress)

    expect(dao.id).not.to.exist
    expect(dao.daoAddress).to.eq(mockDao.daoAddress)
    expect(dao.network).to.eq(mockDao.network)
  })

  it('getDaoMembers with multiSigMembers', async () => {
    const mockDao = DaoList[1]
    await Models.Dao.create(mockDao)

    const daoAddress = mockDao.daoAddress
    const network = mockDao.network

    const filters = {
      limit: 10,
      skip: 0,
      orderBy: 'address',
      orderDirection: 'asc',
    }

    const fakeResponse = [
      {
        address: '0x25cd4b8a02a8f9e920eb02fac38c2954694a3fa5',
      },
      {
        address: '0x3ffe3f16d47a54b1c6a3f47c9e6ff5c2c1b32859',
      },
      {
        address: '0x42342037e0fc34c130cdb079139f8ae56d38453f',
      },
      {
        address: '0xaf2c536f9af22548829b20e9afc567259c820c62',
      },
      {
        address: '0xdf62645a2c714febbf6060d1fb607e7eccef0659',
      },
    ]
    const stubSatsuma = sandbox
      .stub(Satsuma, 'getMultiSigMembers')
      .resolves(fakeResponse as any)

    const result = await DaoController.getDaoMembersMultiSig(
      network as NetworksEnum,
      daoAddress as HexAddress,
      filters,
    )

    expect(result.members.length).to.eq(5)
    expect(stubSatsuma.calledOnce).to.be.true
    expect(stubSatsuma.args[0][0]).to.eq(network)
    expect(stubSatsuma.args[0][1]).to.eq(mockDao.plugins[0].address)
    expect(stubSatsuma.args[0][2]).to.eq(filters)
  })

  it('getDaoMembers with tokenVotingMembers', async () => {
    const mockDao = DaoList[3]
    await Models.Dao.create(mockDao)

    const daoAddress = mockDao.daoAddress
    const network = mockDao.network

    const filters = {
      limit: 10,
      skip: 0,
      orderBy: 'address',
      orderDirection: 'asc',
    }

    const fakeResponse = [
      {
        address: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
        balance: '69000000000000000000',
        votingPower: '69000000000000000000',
        delegatee: {
          address: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
        },
        delegators: [
          {
            address: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
            balance: '69000000000000000000',
          },
        ],
      },
      {
        address: '0x839395e20bbb182fa440d08f850e6c7a8f6f0780',
        balance: '69000000000000000000',
        votingPower: '69000000000000000000',
        delegatee: {
          address: '0x839395e20bbb182fa440d08f850e6c7a8f6f0780',
        },
        delegators: [
          {
            address: '0x839395e20bbb182fa440d08f850e6c7a8f6f0780',
            balance: '69000000000000000000',
          },
        ],
      },
    ]
    const stubSatsuma = sandbox
      .stub(Satsuma, 'getTokenVotingMembers')
      .resolves(fakeResponse as any)

    const result = await DaoController.getDaoMembersTokenVoting(
      network as NetworksEnum,
      daoAddress as HexAddress,
      filters,
    )

    expect(result.members.length).to.eq(2)
    expect(stubSatsuma.calledOnce).to.be.true
    expect(stubSatsuma.args[0][0]).to.eq(network)
    expect(stubSatsuma.args[0][1]).to.eq(mockDao.plugins[0].address)
    expect(stubSatsuma.args[0][2]).to.eq(filters)
  })
})
