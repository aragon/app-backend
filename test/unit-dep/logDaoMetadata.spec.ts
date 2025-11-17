import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { type HexAddress, IMultiSigLogs, NetworksEnum } from '@types'
import { LibUtils } from '@test/lib/unit-dep/lib'
import Web3Helper from '@helpers/web3'
import { MetadataHandler } from '@handlers/metadataHandler'
import IPFSModule from '@modules/ipfs'
import { Models } from '@dbModels'
import { expect } from 'chai'
import DaoController from '@api/controllers/dao'

describe('Integ: Token', () => {
  let sandbox: SinonSandbox
  const network = NetworksEnum.ethereumSepolia
  const dao1 = {
    address: '0x74188b9d8CCfe236B0A20de171d79e233357154B',
    blockNumber:9639027
  }
  const dao2 = {
    address: '0xc699e406aE34f755dC248507Ca3cb035FD468De6',
    blockNumber:9632588
  }
  const iLogInfoParent = {
    network,
    transactionIndex: 10,
    logIndex: 10,
    transactionHash: '0xaTxHash',
    address: dao1.address as HexAddress,
    eventName: IMultiSigLogs.MetadataSet,
    blockNumber: 0
  }

  const metadataOfParent = {
    name: 'Parent DAO',
    description: 'This is the parent DAO',
    avatar: 'ipfs://parentAvatarHash',
    links: [],
    processKey: undefined,
    stageNames: undefined,
    blockedCountries: [],
    termsConditionsUrl: null,
    enableOfacCheck: null,
    parentDao: null,
    subDaos: [dao2.address as HexAddress],
  }

  const iLogInfoChild = {
    network,
    transactionIndex: 5,
    logIndex: 5,
    transactionHash: '0xbTxHash',
    address: dao2.address as HexAddress,
    eventName: IMultiSigLogs.MetadataSet,
    blockNumber: 0
  }

  const metadataOfChild = {
    name: 'Child DAO',
    description: 'This is the child DAO',
    avatar: 'ipfs://childAvatarHash',
    links: [],
    processKey: undefined,
    stageNames: undefined,
    blockedCountries: [],
    termsConditionsUrl: null,
    enableOfacCheck: null,
    parentDao: dao1.address as HexAddress,
    subDaos: [],
  }

  let libUtils: LibUtils

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    libUtils = new LibUtils({
      daoAddress: dao1.address,
      network,
      config: {
        sandbox,
      }
    })
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('test get logDaoMetadata', async function () {

    this.timeout(1000000000)

    await libUtils.syncCompleteDao(dao1.blockNumber - 1)
    libUtils.daoAddress = dao2.address
    sandbox.restore()

    await libUtils.syncCompleteDao(dao2.blockNumber - 1)

    const childMetadataUpdateBlockNumber = await Web3Helper.getBlockNumber(undefined, network) - 10
    const parentMetadataUpdateBlockNumber = childMetadataUpdateBlockNumber + 5

    iLogInfoParent.blockNumber = parentMetadataUpdateBlockNumber
    iLogInfoChild.blockNumber = childMetadataUpdateBlockNumber

    function ipfsUriToHex(ipfsUri: string): string {
      const hex = Buffer.from(ipfsUri, 'utf8').toString('hex')
      return '0x' + hex
    }

    sandbox.stub(IPFSModule, 'fetchMetadata')
      .onFirstCall().resolves(metadataOfParent)
      .onSecondCall().resolves(metadataOfChild)

    await MetadataHandler.metadataSet({
      args: {
        metadata: ipfsUriToHex('ipfs://QmX8YL32g7NBeEy33khGWwdfiPSv6Ku3K3fhns9pJxzjgT'),
      }
    } as any, iLogInfoParent)

    await MetadataHandler.metadataSet({
      args: {
        metadata: ipfsUriToHex('ipfs://QmY7z3bG7gbcEwY33khGWwdfiPSv6Ku3K3fhns9pJxzjgU'),
      }
    } as any, iLogInfoChild)

    const dao1Db = await Models.Dao.findByAddress(dao1.address as HexAddress, network)
    const dao2Db = await Models.Dao.findByAddress(dao2.address as HexAddress, network)

    expect(dao1Db.subDaos).to.be.an('array').that.include(dao2Db.address)
    expect(dao2Db.parentDao).to.equal(dao1Db.address)

    sandbox.restore()
    sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
      ...metadataOfParent,
      subDaos: []
    })

    await MetadataHandler.metadataSet({
      args: {
        metadata: ipfsUriToHex('ipfs://QmX8YL32g7NBeEy33khGWwdfiPSv6Ku3K3fhns9pJxzjgT'),
      }
    } as any, {
      ...iLogInfoParent,
      blockNumber: parentMetadataUpdateBlockNumber + 1,
      transactionHash: '0xupdatedTxHashOfMetadata'
    })

    const dao1DbUpdated = await Models.Dao.findByAddress(dao1.address as HexAddress, network)
    const dao2DbUpdated = await Models.Dao.findByAddress(dao2.address as HexAddress, network)

    expect(dao1DbUpdated.subDaos).to.be.an('array').that.not.include(dao2Db.address)
    expect(dao2DbUpdated.parentDao).to.be.null

    sandbox.restore()
    sandbox.stub(IPFSModule, 'fetchMetadata').resolves(metadataOfParent)

    //let's now again put the metadata on the parent dao to make sure the relationship is re-established
    await MetadataHandler.metadataSet({
      args: {
        metadata: ipfsUriToHex('ipfs://QmX8YL32g7NBeEy33khGWwdfiPSv6Ku3K3fhns9pJxzjgT'),
      }
    } as any, {
      ...iLogInfoParent,
      blockNumber: parentMetadataUpdateBlockNumber + 2,
      transactionHash: '0xupdatedTxHashOfMetadataAgain'
    })

    const dao1DbReUpdated = await Models.Dao.findByAddress(dao1.address as HexAddress, network)
    const dao2DbReUpdated = await Models.Dao.findByAddress(dao2.address as HexAddress, network)

    expect(dao1DbReUpdated.subDaos).to.be.an('array').that.include(dao2Db.address)
    expect(dao2DbReUpdated.parentDao).to.equal(dao1Db.address)

    // let's say now the subdao relationship is removed from child dao metadata
    sandbox.restore()
    sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
      ...metadataOfChild,
      parentDao: null
    })

    await MetadataHandler.metadataSet({
      args: {
        metadata: ipfsUriToHex('ipfs://QmY7z3bG7gbcEwY33khGWwdfiPSv6Ku3K3fhns9pJxzjgU'),
      }
    } as any, {
      ...iLogInfoChild,
      blockNumber: childMetadataUpdateBlockNumber + 1,
      transactionHash: '0xupdatedTxHashOfChildMetadata'
    })

    const dao1DbFinal = await Models.Dao.findByAddress(dao1.address as HexAddress, network)
    const dao2DbFinal = await Models.Dao.findByAddress(dao2.address as HexAddress, network)

    expect(dao1DbFinal.subDaos).to.be.an('array').that.not.include(dao2Db.address)
    expect(dao2DbFinal.parentDao).to.be.null

    sandbox.restore()
    sandbox.stub(IPFSModule, 'fetchMetadata').resolves(metadataOfChild)

    await MetadataHandler.metadataSet({
      args: {
        metadata: ipfsUriToHex('ipfs://QmX8YL32g7NBeEy33khGWwdfiPSv6Ku3K3fhns9pJxzjgT'),
      }
    } as any, {
      ...iLogInfoChild,
      blockNumber: childMetadataUpdateBlockNumber + 5,
      transactionHash: '0xupdatedTxHashOfMetadataFinal'
    })

    //now Let's query the get dao endpoint to make sure the parent-child relationship is re-established

    const daoApiData = await DaoController.getDaoByAddress(
      dao1.address,
      network,
    )

    expect(daoApiData.address).to.be.eq(dao1.address)
    expect(daoApiData.subDaos).to.be.an('array').with.lengthOf(1)
    expect(daoApiData.subDaos![0].address).to.be.eq(dao2.address)
  })

})
