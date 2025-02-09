import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { Interface } from 'ethers'
import { expect } from 'chai'
import { IEventLogMember, ITransferSide, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { Models } from '@dbModels'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'

const getData = async (txHash: string, network: NetworksEnum): Promise<{ event: any; logInfo: any }[]> => {
  const txReceipt = await Web3Helper.getTransactionReceipt(txHash, network)

  const delegationVotesChangedLogs = Web3Helper.findLogsByName(
    txReceipt!,
    IEventLogMember.DelegateVotesChanged,
    GovernanceERC20.abi,
  )

  const data: any = []
  for (const log of delegationVotesChangedLogs) {
    const logInfo = Web3Helper.parseInfoLog(log.txLog, 'DelegateVotesChanged', network)
    const iFace = new Interface(GovernanceERC20.abi)
    const event = Web3Helper.parseLog(log.txLog, iFace)!
    data.push({ event, logInfo })
  }

  return data
}

describe('Integ: Delegates', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle DelegateVotesChanged event', async () => {
    console.log('Running test...')
  })
})