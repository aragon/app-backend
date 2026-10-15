import { Models } from '@dbModels'
import ProxyContract from '@helpers/proxyContract'
import ProxyWeb3Provider from '@modules/proxyProvider'
import backfillSelectorPermissionStateMutabilityMigration from '@src/migrations/20260926005538-backfillSelectorPermissionStateMutability'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const WETH9 = '0x4200000000000000000000000000000000000006'
const TRANSACTION_HASH = '0x2448bacbb0be389c60547174a5a4e43ad50e5a64d8a5625bd6587bcbd1b24ec6'
const DEPOSIT = '0xd0e30db0'
const TRANSFER = '0xa9059cbb'

const WETH9_ABI = JSON.stringify([
  { type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'dst', type: 'address' },
      { name: 'wad', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
])

const selectorPermission = (logIndex: number, overrides: Record<string, any> = {}) => ({
  id: `${NetworksEnum.baseMainnet}-${TRANSACTION_HASH}-${logIndex}`,
  transactionHash: TRANSACTION_HASH,
  transactionIndex: 49,
  logIndex,
  blockNumber: 51774165,
  network: NetworksEnum.baseMainnet,
  chainId: 8453,
  pluginAddress: '0xc81a23D73f6dCdf090c5eF78B3bc779d7CFe6fa8',
  daoAddress: '0x8Ce7E177b09BBd2de35ff0Cf8E66E7C5a8842122',
  conditionAddress: '0x67C2AC3360F167420103f79AC990Ea9B37aF1eAb',
  selector: DEPOSIT,
  target: WETH9,
  isAllowed: true,
  disallowed: { status: false },
  decoded: { functionName: 'deposit', contractName: 'WETH9', implementationAddress: null },
  ...overrides,
})

// Raw driver so the rows have no stateMutability key.
const seed = async (rows: Record<string, any>[]) => {
  await Models.SelectorPermission.collection.insertMany(rows as any)
}

const seedWeth9 = async (network: NetworksEnum) => {
  await Models.Contract.create({
    network,
    address: WETH9,
    bytecode: '0x60',
    bytecodeHash: '0x01',
    sourceCode: 'contract WETH9 {}',
    abi: WETH9_ABI,
    contractName: 'WETH9',
    isVerified: true,
  })
}

const stateMutabilityOf = async (logIndex: number) => {
  const row = await Models.SelectorPermission.collection.findOne({ logIndex })
  return row?.decoded?.stateMutability ?? null
}

describe('migration: backfill selector permission stateMutability', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('fills payable and nonpayable from the saved ABI', async () => {
    await seedWeth9(NetworksEnum.baseMainnet)
    await seed([
      selectorPermission(1),
      selectorPermission(2, {
        selector: TRANSFER,
        decoded: { functionName: 'transfer', contractName: 'WETH9', implementationAddress: null },
      }),
    ])

    await backfillSelectorPermissionStateMutabilityMigration.start()

    expect(await stateMutabilityOf(1)).to.equal('payable')
    expect(await stateMutabilityOf(2)).to.equal('nonpayable')
  })

  it('decodes on the chain the chainId points at', async () => {
    await seedWeth9(NetworksEnum.optimismMainnet)
    await seed([selectorPermission(1, { chainId: 10 })])

    await backfillSelectorPermissionStateMutabilityMigration.start()

    expect(await stateMutabilityOf(1)).to.equal('payable')
  })

  it('leaves rows null when the contract cannot be decoded or the chain is not indexed', async () => {
    await seed([selectorPermission(1), selectorPermission(2, { chainId: 999999 })])

    await backfillSelectorPermissionStateMutabilityMigration.start()

    expect(await stateMutabilityOf(1)).to.equal(null)
    expect(await stateMutabilityOf(2)).to.equal(null)
  })

  it('skips native transfers, undecoded and already filled rows', async () => {
    await seedWeth9(NetworksEnum.baseMainnet)
    await seed([
      selectorPermission(1, { selector: null, decoded: { functionName: 'NativeTransfer', contractName: 'WETH9' } }),
      selectorPermission(2, { decoded: { functionName: null, contractName: null } }),
      selectorPermission(3, { decoded: { functionName: 'deposit', contractName: 'WETH9', stateMutability: 'view' } }),
    ])

    await backfillSelectorPermissionStateMutabilityMigration.start()

    expect(await stateMutabilityOf(1)).to.equal(null)
    expect(await stateMutabilityOf(2)).to.equal(null)
    expect(await stateMutabilityOf(3)).to.equal('view')
  })
})
