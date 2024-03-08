import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SatsumaHelper from '@helpers/satsuma'
import dayjs from 'dayjs'
import { DaoList } from '@test/lib/fakeGraphDaos'
import { NetworksEnum } from '@types'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3'

describe('Helpers: Satsuma', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('Should _rpCall', async () => {
    const rpcCallStub = sandbox
      .stub(SatsumaHelper, 'graphRequest')
      .resolves(true)
    const network = NetworksEnum.ethereum
    const query = { test: 1 }
    const params = { test: 2 }

    const response = await SatsumaHelper._rpCall(network, query as any, params)

    expect(response).to.be.true
    expect(rpcCallStub.calledOnce).to.be.true
    expect(rpcCallStub.args[0][0]).to.eq(SatsumaHelper.subgraphUrls[network])
    expect(rpcCallStub.args[0][1]).to.eq(query)
    expect(rpcCallStub.args[0][2]).to.eq(params)
  })

  it('should getDaosOfMember', async () => {
    const stubRequest = sandbox.stub(SatsumaHelper, '_rpCall').resolves({
      tokenVotingMembers: [],
      multisigApprovers: [],
    })
    const network = NetworksEnum.ethereum
    const address = '0xe0bd0fe4e70478d5aaf9df546fc76b964ce0bc54'

    const res = await SatsumaHelper.getDaosOfMember(network, address)

    expect(res).to.deep.equal({
      tokenVotingMembers: [],
      multisigApprovers: [],
    })
    expect(stubRequest.calledOnce).to.be.true
    expect(stubRequest.args[0][0]).to.eq(network)
    expect(stubRequest.args[0][2]).to.deep.equal({
      where: {
        address,
      },
    })
  })

  // it('should getDaos', async () => {
  //   const fakeDao = DaoList[0]
  //   const fakeResponse = {
  //     daos: [fakeDao],
  //   }
  //   const stubRequest = sandbox
  //     .stub(SatsumaHelper, '_rpCall')
  //     .resolves(fakeResponse)
  //   const network = NetworksEnum.ethereum
  //   const fromDate = dayjs().subtract(1, 'year').format()
  //   const limit = 100
  //
  //   const res = await SatsumaHelper.getDaos(network, { fromDate, limit })
  //
  //   expect(stubRequest.calledOnce).to.be.true
  //   expect(stubRequest.args[0][0]).to.eq(network)
  //   expect(stubRequest.args[0][2]).to.deep.equal({
  //     where: {
  //       createdAt_gt: dayjs(fromDate).unix().toString(),
  //     },
  //     first: limit,
  //   })
  //   expect(res[0].creatorAddress).to.eq(fakeDao.creator)
  //   expect(res[0].daoAddress).to.eq(fakeDao.id)
  //   expect(res[0].createdAt).to.eq(
  //     dayjs(Number(fakeDao.createdAt) * 1000).toISOString(),
  //   )
  //   expect(res[0].ens).to.eq(fakeDao.daoURI)
  //   expect(res[0].members).to.eq(fakeDao.plugins[0].plugin.members.length)
  //   expect(res[0].metadataIpfs).to.eq(fakeDao.metadata)
  //   expect(res[0].network).to.eq(NetworksEnum.ethereum)
  //   expect(res[0].pluginName).to.eq(fakeDao.plugins[0].plugin.__typename)
  //   expect(res[0].proposalsCreated).to.eq(fakeDao.proposals.length)
  //   expect(res[0].proposalsExecuted).to.eq(
  //     fakeDao.proposals?.filter((p) => p.executed).length,
  //   )
  //   expect(res[0].tvlUSD).to.eq(0)
  //   expect(res[0].uniqueVoters).to.eq(0)
  //   expect(res[0].hideDao).to.eq(false)
  //   expect(res[0].txHash).to.eq(utils.zeroAddress)
  // })

  it('should _parseDao', () => {
    const rawDao = DaoList[0]
    const network = NetworksEnum.ethereum

    const processedDao = SatsumaHelper._parseDao(rawDao as any, network) // This assumes _parseDao is accessible

    const expectedDao = {
      creatorAddress: Web3Utils.parseAddress(rawDao?.creator as any),
      daoAddress: Web3Utils.parseAddress(rawDao.id as any),
      block: Number(rawDao.createdAt),
      createdAt: dayjs(Number(rawDao.createdAt) * 1000).toISOString(),
      ens: rawDao.daoURI,
      members: rawDao.plugins[0].plugin.members.length,
      metadataIpfs: rawDao.metadata,
      network: network,
      pluginName: rawDao.plugins[0].plugin.__typename,
      proposalsCreated: rawDao.proposals?.length,
      proposalsExecuted: rawDao.proposals?.filter(p => p.executed).length,
      tvlUSD: 0,
      txHash: utils.zeroAddress,
      uniqueVoters: 0,
      votes: 0,
      hideDao: false,
    }

    expect(processedDao).to.deep.equal(expectedDao)
  })

  it('should _getPluginInfo', () => {
    const rawDao = DaoList[0]

    const pluginInfo = SatsumaHelper._getPluginInfo(rawDao as any)

    const expectedResult = {
      pluginType: 'MultisigPlugin',
      membersCount: 1,
    }

    expect(pluginInfo).to.deep.equal(expectedResult)
  })
})
