import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: Plugin update proposal condition', () => {
  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0xb86ce4bcF01f4E00a37E26AB44fd7638825f4df9'
  const pluginAddress = '0x16f4d44082ae9Baf47C80D66A80edA4aE48e08E8'
  const updatePreparedTx = '0x9e25e96fae9724b798237424996cb54f1b2deabd3b04b3aec6f38304369b18df'
  const updateAppliedTx = '0x4f943d52dce7cedbb7a68cc839827da1a6b6316413c736b80464881ba3207335'

  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')

    await Models.Dao.create({
      id: `${network}-${daoAddress}`,
      isActive: true,
      isHidden: false,
      network,
      transactionHash: '0x15f993f2431950a0b29ae5221e71390efe5eb7b70777a43d44f995e72d3d2d89',
      blockNumber: 11579258,
      blockTimestamp: 1787851224,
      address: daoAddress,
      implementationAddress: '0x824d4AAD1cbF2327c4C429E3c97F968Ee19344F8',
      creatorAddress: '0x424797Ed6d902E17b9180BFcEF452658e148e0Ab',
      metadataIpfs: 'ipfs://QmeG8o6toYKNwsdwKmRT7Jq1Cu269STaHAqoN8NTsaJkWi',
      name: 'Upgrade Dev DAO',
      version: '1.4.0',
      metrics: {},
    })

    await Models.Plugin.create({
      id: `${network}-0x5d0390bde6f36a723bb99bc7e9468f8e5f04ba6a49ae19ee07f4a504c54e05d5-${pluginAddress}`,
      transactionHash: '0x5d0390bde6f36a723bb99bc7e9468f8e5f04ba6a49ae19ee07f4a504c54e05d5',
      blockNumber: 11607265,
      blockTimestamp: 1788198768,
      network,
      address: pluginAddress,
      implementationAddress: '0x6C5C467c94bcc594DeE61CFa0e8cCa24d835d894',
      interfaceType: 'spp',
      status: IPluginStatus.installed,
      isSupported: true,
      daoAddress,
      pluginSetupRepoAddress: '0xda62D32C14E8CA78958d6fdC0142A575b0cd6Ad4',
      sender: '0x7a20760b89EF507759DD2c5A0d1f1657614341A9',
      release: '1',
      build: '1',
      subdomain: 'spp',
      uninstalled: { status: false },
      isProcess: true,
      isBody: false,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://QmUcpR8sb7Jz24qyQqe5h689TncLCa8rJx1vgLkZFdnvrG',
      name: 'SPP and P',
      processKey: 'SPPP',
      proposalCreationConditionAddress: '0x0174DbcaACF7Ac447CBF4a70999d509fbe548b06',
      subPlugins: [{ addresses: ['0x9536d5dF113730599b16Af49d6A872CdAdd97eB9'], stageIndex: 0 }],
      totalStages: 1,
    })
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should save the new SPP condition when the update moves the proposal permission to it', async function () {
    this.timeout(120000)

    await LibUtils.handleEventsFromTxHashes([updatePreparedTx, updateAppliedTx], network)

    const installed = await Models.Plugin.findOne({ network, address: pluginAddress, status: IPluginStatus.installed })
    expect(installed?.build).to.equal('2')
    expect(installed?.proposalCreationConditionAddress).to.equal('0x69df42478f11d5aAF24d7F1F0a0Af9a1dD4E858B')
  })
})
