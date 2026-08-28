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

  describe('readSppRules', () => {
    it('normalizes logical references and nested condition addresses', async () => {
      const getRulesStub = sandbox.stub().resolves(buildRules())
      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
      })

      const result = await helper.readSppRules(RULE_CONDITION_ADDRESS, NetworksEnum.ethereumSepolia)

      expect(result).to.deep.equal([
        {
          type: 'logic',
          operation: 'or',
          value: '8589934593',
          permissionId: `0x${'00'.repeat(32)}`,
          ruleIndexes: [1, 2],
        },
        {
          type: 'condition',
          operation: 'eq',
          value: BigInt(INTERNAL_BODY_CONDITION).toString(),
          permissionId: `0x${'00'.repeat(32)}`,
          conditionAddress: getAddress(INTERNAL_BODY_CONDITION),
        },
        {
          type: 'condition',
          operation: 'eq',
          value: BigInt(SAFE_BODY_CONDITION).toString(),
          permissionId: `0x${'00'.repeat(32)}`,
          conditionAddress: getAddress(SAFE_BODY_CONDITION),
        },
      ])
    })

    it('keeps unknown rule ids and operations inspectable', async () => {
      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: {
          getRules: sandbox.stub().resolves([{ id: 255n, op: 255n, value: 7n, permissionId: 1n }]),
        },
      })

      const result = await helper.readSppRules(RULE_CONDITION_ADDRESS, NetworksEnum.ethereumSepolia)

      expect(result).to.deep.equal([
        {
          type: 'unknown',
          operation: 'unknown',
          value: '7',
          permissionId: `0x${'00'.repeat(31)}01`,
        },
      ])
    })

    it('keeps all rules when a condition value is wider than an address', async () => {
      const invalidAddressValue = 1n << 160n
      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: {
          getRules: sandbox.stub().resolves([
            { id: CONDITION_RULE_ID, op: 1n, value: invalidAddressValue, permissionId: 0n },
            { id: 204n, op: 1n, value: 7n, permissionId: 0n },
          ]),
        },
      })

      const result = await helper.readSppRules(RULE_CONDITION_ADDRESS, NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(2)
      expect(result[0]).to.deep.equal({
        type: 'condition',
        operation: 'eq',
        value: invalidAddressValue.toString(),
        permissionId: `0x${'00'.repeat(32)}`,
      })
      expect(result[1].type).to.equal('value')
    })
  })

  describe('resolveSppProposerConditions', () => {
    it('should map a discovered safe to its SafeOwnerCondition and skip internal conditions', async () => {
      const getRulesStub = sandbox.stub().resolves(buildRules())
      const internalSafeStub = sandbox.stub().rejects(new Error('execution reverted'))
      const safeStub = sandbox.stub().resolves(SAFE_BODY_ADDRESS)

      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
        [getAddress(INTERNAL_BODY_CONDITION)]: { safe: internalSafeStub },
        [getAddress(SAFE_BODY_CONDITION)]: { safe: safeStub },
      })

      const result = await helper.resolveSppProposerConditions(RULE_CONDITION_ADDRESS, NetworksEnum.ethereumSepolia)

      expect(result.size).to.equal(1)
      expect(result.get(SAFE_BODY_ADDRESS.toLowerCase())).to.deep.equal({
        safeAddress: getAddress(SAFE_BODY_ADDRESS),
        conditionAddress: getAddress(SAFE_BODY_CONDITION),
      })
      expect(getRulesStub.calledOnce).to.be.true
    })

    it('should return every discovered safe regardless of whether it is a stage body', async () => {
      const secondSafeCondition = getAddress('0x1111111111111111111111111111111111111111')
      const secondSafeAddress = getAddress('0x2222222222222222222222222222222222222222')

      const getRulesStub = sandbox.stub().resolves([
        { id: CONDITION_RULE_ID, op: 1n, value: BigInt(SAFE_BODY_CONDITION), permissionId: 0n },
        { id: CONDITION_RULE_ID, op: 1n, value: BigInt(secondSafeCondition), permissionId: 0n },
      ])

      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
        [getAddress(SAFE_BODY_CONDITION)]: { safe: sandbox.stub().resolves(SAFE_BODY_ADDRESS) },
        [secondSafeCondition]: { safe: sandbox.stub().resolves(secondSafeAddress) },
      })

      const result = await helper.resolveSppProposerConditions(RULE_CONDITION_ADDRESS, NetworksEnum.ethereumSepolia)

      expect(result.size).to.equal(2)
      expect(result.get(SAFE_BODY_ADDRESS.toLowerCase())?.conditionAddress).to.equal(getAddress(SAFE_BODY_CONDITION))
      expect(result.get(secondSafeAddress.toLowerCase())?.conditionAddress).to.equal(secondSafeCondition)
    })

    it('should return an empty map when the rule condition address is missing or zero', async () => {
      const helper = mockHelper({})

      const missing = await helper.resolveSppProposerConditions(null, NetworksEnum.ethereumSepolia)
      const zero = await helper.resolveSppProposerConditions(ZeroAddress, NetworksEnum.ethereumSepolia)

      expect(missing.size).to.equal(0)
      expect(zero.size).to.equal(0)
    })

    it('should throw when getRules fails, instead of returning an empty map', async () => {
      const rpcError = new Error('rpc error')
      const getRulesStub = sandbox.stub().rejects(rpcError)
      const helper = mockHelper({
        [getAddress(RULE_CONDITION_ADDRESS)]: { getRules: getRulesStub },
      })

      await expect(
        helper.resolveSppProposerConditions(RULE_CONDITION_ADDRESS, NetworksEnum.ethereumSepolia),
      ).to.be.rejectedWith(rpcError)
    })
  })
})
