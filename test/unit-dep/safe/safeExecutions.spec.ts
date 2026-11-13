import { SafeExecutionEvents } from '@artifacts/Safe'
import { Models } from '@dbModels'
import { SafeExecutionHandler } from '@handlers/safeExecutionHandler'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { LibUtils } from '@test/lib/unit-dep/lib'
import SafeFixture from '@test/lib/unit-dep/safe'
import { ITransactionType } from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'

describe('Safe execution rows', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    for (const level of ['info', 'verbose', 'debug', 'warn', 'error'] as const) sandbox.stub(logger, level)
    SafeFixture.stubSafeQueues(sandbox)
  })

  afterEach(() => sandbox.restore())

  it('stores the real Safe execution with its event id and relayer', async () => {
    const network = SafeFixture.network
    const safeAddress = SafeFixture.body.safeAddress
    const transactionHash = '0xcbfaf3e673c24b19dfe8f75bcfeba26bb5a09b07adcd4f07c26ade201c9c454f'
    await Models.SafeAccount.track(network, safeAddress)
    const events = await LibUtils.getData(SafeExecutionEvents.abi, 'ExecutionSuccess', transactionHash, network)
    expect(events).to.have.length(1)

    await SafeExecutionHandler.executionSuccess(events[0].event, events[0].logInfo)
    await SafeExecutionHandler.executionSuccess(events[0].event, events[0].logInfo)

    const receipt = await Web3Helper.getTransactionReceipt(transactionHash, network)
    expect(receipt).to.exist
    const rows = await Models.Transaction.find({ network, daoAddress: safeAddress, transactionHash })
    expect(rows).to.have.length(1)
    expect(rows[0]).to.include({
      id: `${safeAddress}-${network}-${transactionHash}-17-59-execution`,
      type: ITransactionType.execution,
      isSuccessful: true,
      safeTxHash: '0x5b4a47c5f0907c1ecbc42b47b2ce446004824e55d27feb2e4023359a736bcd3e',
      fromAddress: getAddress(receipt!.from),
      toAddress: safeAddress,
      blockNumber: receipt!.blockNumber,
      transactionIndex: 17,
      logIndex: 59,
      value: '0',
    })
  })
})
