import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import AllowanceState from '@modules/proposalChecks/allowances'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import ProviderModule from '@modules/provider'
import { DECATS } from '@test/mock/proposalChecks/incidents'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface } from 'ethers'
import * as sinon from 'sinon'

const TOKEN = '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18'
const BROKEN_TOKEN = '0x4444444444444444444444444444444444444444'
const SPENDER = '0x5555555555555555555555555555555555555555'
const DAO = DECATS.daoAddress
const erc20 = new Interface([
  'function approve(address,uint256)',
  'function decreaseAllowance(address,uint256)',
  'function transferFrom(address,address,uint256)',
  'function allowance(address,address)',
])
const call = (to: string, fn: string, args: any[]) => ({ to, value: '0', data: erc20.encodeFunctionData(fn, args) })

describe('proposalChecks/allowances', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('reads the allowance an approval replaces from the token at the block, and leaves out a read that fails', async () => {
    sandbox.stub(logger, 'warn')
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const provider = {
      call: sandbox.stub().callsFake(async (tx: { to: string }) => {
        if (tx.to.toLowerCase() === BROKEN_TOKEN.toLowerCase()) throw new Error('execution reverted')
        return AbiCoder.defaultAbiCoder().encode(['uint256'], [7])
      }),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
    const actions = AssessmentContextBuilder._flatten(
      [
        call(TOKEN, 'approve', [SPENDER, 5]),
        call(BROKEN_TOKEN, 'decreaseAllowance', [SPENDER, 1]),
        call(TOKEN, 'transferFrom', [DAO, SPENDER, 1]),
      ],
      DAO,
    )

    const before = await AllowanceState.load(actions, NetworksEnum.polygonMainnet, 100)

    expect(before).to.deep.eq({ '0': '7' })
    expect(provider.call.callCount).to.eq(2)
    const read = provider.call.args[0][0]
    expect(read.blockTag).to.eq(100)
    expect(erc20.decodeFunctionData('allowance', read.data).map(String)).to.deep.eq([DAO, SPENDER])
  })

  it('reads nothing when the account the approval runs as is not known', async () => {
    const getProvider = sandbox.stub(ProviderModule, 'getAnyRpcProvider')
    const [approve] = AssessmentContextBuilder._flatten([call(TOKEN, 'approve', [SPENDER, 5])], DAO)

    const before = await AllowanceState.load([{ ...approve, caller: null }], NetworksEnum.polygonMainnet, 100)

    expect(before).to.deep.eq({})
    expect(getProvider.called).to.be.false
  })
})
