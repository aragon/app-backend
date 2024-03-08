import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DuneHelper from '@helpers/dune'
import logger from '@logger'
import config from '@config'
import dayjs from 'dayjs'

describe('Helpers: Dune', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('Should _rpCall', async () => {
    const rpcCallStub = sandbox
      .stub(DuneHelper.axiosInstance, 'get')
      .resolves(true)

    const response = await DuneHelper._rpCall('/path')

    expect(response).to.be.true
    expect(rpcCallStub.calledOnce).to.be.true
    expect(rpcCallStub.calledWith(`/path?api_key=${config.DUNE.API_KEY}`)).to.be
      .true
  })

  it('should getDaos', async () => {
    const mockDao = {
      creator_address: '0xBb048E05E69eef8781eB0ddD4B81579c7fBC6Be2',
      dao_address: '0xF067cf721224421135dF6283E29686Ee02e1A2D1',
      block_time: '2023-07-19 08:06:13.000 UTC',
      members: 1,
      metadata_ipfs: 'ipfs://exampleData\u0000\u0000\u0000',
      network: 'polygon',
      plugin_name: 'token-voting-repo',
      proposals_created: 0,
      proposals_executed: 0,
      tvl_usd: 0,
      tx_hash:
        '0xc9c50eb035307a5e3f63343c169332589737da155356a1ad5d461247c54fee3a',
      unique_voters: 0,
      votes: 0,
      hide_dao: false,
      ens: null,
    }

    const expectedDao = {
      creatorAddress: mockDao.creator_address,
      daoAddress: mockDao.dao_address,
      createdAt: dayjs(mockDao.block_time).toISOString(),
      members: mockDao.members,
      metadataIpfs: mockDao.metadata_ipfs.replace(/\0/g, ''),
      network: mockDao.network,
      pluginName: mockDao.plugin_name,
      proposalsCreated: mockDao.proposals_created,
      proposalsExecuted: mockDao.proposals_executed,
      tvlUSD: mockDao.tvl_usd,
      txHash: mockDao.tx_hash,
      uniqueVoters: mockDao.unique_voters,
      votes: mockDao.votes,
      hideDao: mockDao.hide_dao,
      ens: mockDao.ens,
    }

    const mockResponse = {
      data: {
        result: {
          rows: [mockDao],
          metadata: { row_count: 1 },
        },
      },
    }

    const rpcCallStub = sandbox
      .stub(DuneHelper, '_rpCall')
      .resolves(mockResponse as any)
    const loggerStub = sandbox.stub(logger, 'error')

    const res = await DuneHelper.getDaos()

    expect(loggerStub.notCalled).to.be.true
    expect(rpcCallStub.calledOnce).to.be.true
    expect(rpcCallStub.calledWith('/query/3208626/results')).to.be.true
    expect(res.daos.length).to.equal(1)

    const parsedDao = res.daos[0]
    Object.keys(expectedDao).forEach(key => {
      expect(parsedDao[key]).to.eql(
        expectedDao[key],
        `Field ${key} did not match.`,
      )
    })
    expect(res.total).to.equal(1)
  })
})
