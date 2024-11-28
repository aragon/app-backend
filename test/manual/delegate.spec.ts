import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { IEventLogMember, ITransferSide, NetworksEnum } from '@types'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import Web3Helper from '@helpers/web3'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

describe('Manual: Delegate', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should fetch delegator', async function () {
    this.timeout(1600000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    const txReceipt = await Web3Helper.getTransactionReceipt(
      '0x73f7018794a1cf5fdcfbff3e45cbfaa69455ec58543933f15d0977c1cceb2ecf',
      NetworksEnum.ethereumSepolia,
    )

    const delegationVotesChangedLogs = Web3Helper.findLogsByName(
      txReceipt!,
      IEventLogMember.DelegateVotesChanged,
      GovernanceERC20.abi,
    )

    const logInfo = Web3Helper.parseInfoLog(
      delegationVotesChangedLogs[0].txLog,
      'DelegateVotesChanged',
      NetworksEnum.ethereumSepolia,
    )

    const iFace = new Interface(GovernanceERC20.abi)
    const event = Web3Helper.parseLog(delegationVotesChangedLogs[0].txLog, iFace)!

    await GovernanceErc20Handler._findDelegatorsFromReceipt(event, logInfo, ITransferSide.incoming)
  })
})
