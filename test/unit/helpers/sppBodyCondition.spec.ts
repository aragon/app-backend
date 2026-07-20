import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { getAddress, toBeHex, ZeroAddress } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const RULE_CONDITION_ADDRESS = '0xb28a9D4463c03790eC7CA725eDb7A46b0dB6dAaa'
const INTERNAL_BODY_CONDITION = '0x2ccB021608200E534ebDeCe4FcEE15FD7D5B61aA'
const SAFE_BODY_CONDITION = getAddress('0xdb7d1c47a4b3a4b8cfce0a7cf1be36d3fc45277e')
const SAFE_BODY_ADDRESS = '0xeB88A1D01306Bd9d8442673ee78770f2665B008F'

const CONDITION_RULE_ID = 202n
const LOGIC_OP_RULE_ID = 203n

const buildRules = () => [
  { id: LOGIC_OP_RULE_ID, op: 10n, value: 0x200000001n, permissionId: 0n },
  { id: CONDITION_RULE_ID, op: 1n, value: BigInt(INTERNAL_BODY_CONDITION), permissionId: 0n },
  { id: CONDITION_RULE_ID, op: 1n, value: BigInt(SAFE_BODY_CONDITION), permissionId: 0n },
]

describe('Helpers: SppBodyConditionHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({})
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const mockHelper = (contractsByAddress: Record<string, any>) => {
    const { default: MockedHelper } = proxyquire.noCallThru()('@helpers/sppBodyCondition', {
      ethers: {
        Contract: function (address: string) {
          return contractsByAddress[getAddress(address)] || {}
        },
        getAddress,
        toBeHex,
        ZeroAddress,
      },
    })
    return MockedHelper
  }

  describe('resolveExternalBodyConditions', () => {
    it('should map a safe body to its SafeOwnerCondition and skip internal conditions', async () => {
      const getRulesStub = sandbox.stub().resolves(buildRules())
      const internalSafeStub = sandbox.stub().rejects(new Error('execution reverted'))
      const safeStub = sandbox.stub().resolves(SAFE_BODY_ADDRESS)

      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
        [getAddress(INTERNAL_BODY_CONDITION)]: { safe: internalSafeStub },
        [getAddress(SAFE_BODY_CONDITION)]: { safe: safeStub },
      })

      const result = await helper.resolveExternalBodyConditions(
        RULE_CONDITION_ADDRESS,
        [SAFE_BODY_ADDRESS],
        NetworksEnum.ethereumSepolia,
      )

      expect(result.size).to.equal(1)
      expect(result.get(SAFE_BODY_ADDRESS.toLowerCase())).to.equal(getAddress(SAFE_BODY_CONDITION))
      expect(getRulesStub.calledOnce).to.be.true
    })

    it('should return an empty map when the rule condition address is missing or zero', async () => {
      const helper = mockHelper({})

      const missing = await helper.resolveExternalBodyConditions(
        null,
        [SAFE_BODY_ADDRESS],
        NetworksEnum.ethereumSepolia,
      )
      const zero = await helper.resolveExternalBodyConditions(
        ZeroAddress,
        [SAFE_BODY_ADDRESS],
        NetworksEnum.ethereumSepolia,
      )

      expect(missing.size).to.equal(0)
      expect(zero.size).to.equal(0)
    })

    it('should return an empty map when there are no external bodies', async () => {
      const getRulesStub = sandbox.stub().resolves(buildRules())
      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
      })

      const result = await helper.resolveExternalBodyConditions(
        RULE_CONDITION_ADDRESS,
        [],
        NetworksEnum.ethereumSepolia,
      )

      expect(result.size).to.equal(0)
      expect(getRulesStub.notCalled).to.be.true
    })

    it('should return an empty map when getRules fails', async () => {
      const getRulesStub = sandbox.stub().rejects(new Error('rpc error'))
      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
      })

      const result = await helper.resolveExternalBodyConditions(
        RULE_CONDITION_ADDRESS,
        [SAFE_BODY_ADDRESS],
        NetworksEnum.ethereumSepolia,
      )

      expect(result.size).to.equal(0)
    })

    it('should leave bodies unmapped when no sub-condition matches them', async () => {
      const otherSafe = '0x1111111111111111111111111111111111111111'
      const getRulesStub = sandbox.stub().resolves(buildRules())
      const internalSafeStub = sandbox.stub().rejects(new Error('execution reverted'))
      const safeStub = sandbox.stub().resolves(otherSafe)

      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
        [getAddress(INTERNAL_BODY_CONDITION)]: { safe: internalSafeStub },
        [getAddress(SAFE_BODY_CONDITION)]: { safe: safeStub },
      })

      const result = await helper.resolveExternalBodyConditions(
        RULE_CONDITION_ADDRESS,
        [SAFE_BODY_ADDRESS],
        NetworksEnum.ethereumSepolia,
      )

      expect(result.size).to.equal(0)
    })
  })
})
