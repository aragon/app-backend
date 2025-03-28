import { expect } from 'chai'
import { NetworksEnum } from '@types'
import MultisigHelper from '@helpers/multisig'
import sinon, { SinonSandbox } from 'sinon'
import configIndexer from '@indexer/configIndexer'
import EventListenerV2 from '@modules/eventListenerV2'
import config from '@config'
import utils from '@helpers/utils'

describe('Multisig Helper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getMultisigOwners', async () => {
    const pluginAddress = '0x8Dbf0B1aD4A38973DBD1a6579428b6c73AC297B1'
    const network = NetworksEnum.peaqMainnet
    const settings = await MultisigHelper.findSettings(pluginAddress, network)
    expect(settings?.onlyListed).to.be.true
    expect(settings?.minApprovals).to.eq(1)
  })

  it('should do the test of event listener', async () => {
    const eventListener = new EventListenerV2(NetworksEnum.peaqMainnet, configIndexer, {
      processingTimeoutMs: config.REALTIME.PROCESSING_TIMEOUT_MS,
      maxFailures: config.REALTIME.MAX_FAILURES,
      circuitBreakerPauseMs: config.REALTIME.CIRCUIT_BREAKER_PAUSE_MS,
      batchWindowMs: config.NODES[utils.networkToAragon(NetworksEnum.peaqMainnet)].INTERVAL_BLOCK_TIME,
    })

    await eventListener['processBlockLogic'](4298912)
  })
})
