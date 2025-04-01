import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import { BlockHandler } from '@modules/blockHandler'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'

describe('Unit-dep: Block Handler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    const blockNumber = 7630101
    const network = NetworksEnum.ethereumSepolia

    const processReceiverStub = sandbox.stub(BlockHandler, 'processReceiver')

    const blockReceipts = await Web3Helper.getBlockReceipts(network, blockNumber)

    await BlockHandler._checkIfDepositEvents(blockReceipts, network)

    expect(processReceiverStub.calledOnce).to.be.true
    expect(processReceiverStub.args[0][1].length).to.be.eq(23)
  })
})
