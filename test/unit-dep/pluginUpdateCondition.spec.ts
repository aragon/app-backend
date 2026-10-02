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
  const pluginAddress = '0x16f4d44082ae9Baf47C80D66A80edA4aE48e08E8'
  const daoCreatedTx = '0x15f993f2431950a0b29ae5221e71390efe5eb7b70777a43d44f995e72d3d2d89'
  const installationPreparedTx = '0x5d0390bde6f36a723bb99bc7e9468f8e5f04ba6a49ae19ee07f4a504c54e05d5'
  const installationAppliedTx = '0x1a8473a3b4ed8cfbb1d60add844b5cd15547219ca9b461ef846d0ee98af1cd78'
  const updatePreparedTx = '0x9e25e96fae9724b798237424996cb54f1b2deabd3b04b3aec6f38304369b18df'
  const updateAppliedTx = '0x4f943d52dce7cedbb7a68cc839827da1a6b6316413c736b80464881ba3207335'

  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should save the new SPP condition when the update moves the proposal permission to it', async function () {
    this.timeout(300000)

    await LibUtils.handleEventsFromTxHashes(
      [daoCreatedTx, installationPreparedTx, installationAppliedTx, updatePreparedTx, updateAppliedTx],
      network,
    )

    const installed = await Models.Plugin.findOne({ network, address: pluginAddress, status: IPluginStatus.installed })
    expect(installed?.build).to.equal('2')
    expect(installed?.proposalCreationConditionAddress).to.equal('0x69df42478f11d5aAF24d7F1F0a0Af9a1dD4E858B')
  })
})
