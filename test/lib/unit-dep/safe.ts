import SafeController from '@api/controllers/safe'
import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import SafeTxServiceModule from '@modules/safeTxService'
import { SafeGateway } from '@services/aragon-gateway/safe'
import { LibUtils } from '@test/lib/unit-dep/lib'
import {
  EnumQueueName,
  type HexAddress,
  type IQueueSafeRead,
  type ISafeMultisigTransaction,
  type ISafeNextNonceResponse,
  type ISafeQueueResponse,
  ISafeReadKind,
  ISafeTransactionState,
  NetworksEnum,
} from '@types'
import axios from 'axios'
import { expect } from 'chai'
import { Contract, getAddress, TypedDataEncoder, Wallet, ZeroAddress } from 'ethers'
import { type SinonSandbox, type SinonSpy } from 'sinon'

const safeAbi = [
  'function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)',
]

const SafeFixture = {
  network: NetworksEnum.ethereumSepolia,
  chainId: 11155111,
  safeAddress: '0xE9C78Ac980BDfE01587FdC9a3ebdfA9243cc5f9f' as HexAddress,
  daoAddress: '0x00708aC967a5D7069B7B05358f82d8556f9549F3' as HexAddress,
  creationTx: '0xb00adff94aead807e61635ea21da505c6051b7421c7aa06de0b76ebd5163c121',
  grantTx: '0xc973ca52709700cc9339b0bdebe3319d1578417473cf72c0c201b2c377bc1494',
  executedTxHashes: [
    '0xaf97e765496c95bb8d62b8212925da7518b3418dec3be71fbc912ea1a82be8f6',
    '0x3caf69e4010c3db2fde1fb0ce178614e50c1576c4044d9fdaa0dcf51d8aa5dc7',
    '0xcb0dd1c587f2e03c95842f2e2f33a692de18c3bf936f793fee01c99179705658',
    '0x38fa8160f721c36da47e554e0afb3bab544272720943d3a2754e80f0f4baa1a0',
  ],
  executedBlocks: [11799788, 11799789, 11799790, 11799791],
  owners: ['0xdca88C8588f97a685209DD8fc99Bd4fe776091C9', '0x5F1680d0c2c5E9d3615a036FbDc7432E7bf246FB'] as HexAddress[],
  body: {
    daoAddress: '0x665928FeacC8739116A3f2eF66a9c61936348DC2' as HexAddress,
    sppAddress: '0xc18021bF09671A21F474A8C059c987BA895bDBF7' as HexAddress,
    safeAddress: '0x8442c05d620e11009bdaEDdefDA3b5303725c39A' as HexAddress,
    installTx: '0x09c5e2db4e488b15bc65ef1d239cbdac959264696e0637ff6c389c5de6d0f648' as HexAddress,
    installBlock: 11681708,
    proposalIndexes: {
      1: '88995626346429952950895700040679797192033948228404734175794720873791947498256',
      3: '53516197537332315329861570792397120857788539267478112127109269497149572965787',
    },
    reports: {
      2: '0x2ba2a6077eb23eee86e940bcc17c4f39deeefb685d4f792b8c6457fc2bfd33fa',
      4: '0xc1f06a767eab76d4484dc52e115f97f66482b73c99488a4bc35b28b64ff73d3d',
      8: '0x5b4a47c5f0907c1ecbc42b47b2ce446004824e55d27feb2e4023359a736bcd3e',
    },
  },

  stubSafeQueues(sandbox: SinonSandbox): Array<{ queue: EnumQueueName; payload: any }> {
    const sent: Array<{ queue: EnumQueueName; payload: any }> = []
    sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (queue, message, options) => {
      if (queue === EnumQueueName.safeRead && options?.waitResponse) {
        return await SafeGateway.read(message.params as IQueueSafeRead)
      }
      sent.push({ queue, payload: message })
    })
    sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').callsFake(async (queue, payload) => {
      sent.push({ queue, payload })
    })
    return sent
  },

  async replayRegistration(): Promise<void> {
    await LibUtils.registerPluginRepos(SafeFixture.network)
    await LibUtils.handleEventsFromTxHashes([SafeFixture.creationTx, SafeFixture.grantTx], SafeFixture.network)
  },

  _signer(): Wallet {
    const key = process.env.SAFE_SEPOLIA_OWNER_PK
    if (!key) throw new Error('SAFE_SEPOLIA_OWNER_PK is not set')
    const wallet = new Wallet(key)
    if (getAddress(wallet.address) !== SafeFixture.owners[0]) {
      throw new Error('SAFE_SEPOLIA_OWNER_PK is not the first Safe owner')
    }
    return wallet
  },

  _requestConfig() {
    if (!config.SAFE_API.API_KEY) throw new Error('SAFE_API_KEY is not set')
    return {
      headers: { Authorization: `Bearer ${config.SAFE_API.API_KEY}` },
      timeout: config.SAFE_API.TIMEOUT,
    }
  },

  async propose(nonce: bigint, value: string, ledger: string[]): Promise<{ safeTxHash: string; nonce: string }> {
    const wallet = SafeFixture._signer()
    const transaction = {
      to: SafeFixture.owners[0],
      value,
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZeroAddress,
      refundReceiver: ZeroAddress,
      nonce: nonce.toString(),
    }
    const domain = { chainId: SafeFixture.chainId, verifyingContract: SafeFixture.safeAddress }
    const types = {
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    }
    const safeTxHash = TypedDataEncoder.hash(domain, types, transaction)
    const safe = new Contract(SafeFixture.safeAddress, safeAbi, ProviderModule.getAnyRpcProvider(SafeFixture.network))
    const onchainHash: string = await safe.getTransactionHash(
      transaction.to,
      transaction.value,
      transaction.data,
      transaction.operation,
      transaction.safeTxGas,
      transaction.baseGas,
      transaction.gasPrice,
      transaction.gasToken,
      transaction.refundReceiver,
      transaction.nonce,
    )
    if (onchainHash.toLowerCase() !== safeTxHash.toLowerCase()) {
      throw new Error('The local safeTxHash does not match the Safe')
    }
    const signature = await wallet.signTypedData(domain, types, transaction)
    const url = `${SafeTxServiceModule.baseUrl(SafeFixture.network)}/v2/safes/${SafeFixture.safeAddress}/multisig-transactions/`

    ledger.push(safeTxHash)
    await retryRequest(() =>
      axios.post(
        url,
        {
          ...transaction,
          contractTransactionHash: safeTxHash,
          sender: wallet.address,
          signature,
          origin: 'aragon-unit-dep',
        },
        SafeFixture._requestConfig(),
      ),
    )

    return { safeTxHash, nonce: transaction.nonce }
  },

  async remove(safeTxHash: string): Promise<void> {
    await retryRequest(async () => {
      const wallet = SafeFixture._signer()
      const domain = {
        name: 'Safe Transaction Service',
        version: '1.0',
        chainId: SafeFixture.chainId,
        verifyingContract: SafeFixture.safeAddress,
      }
      const types = {
        DeleteRequest: [
          { name: 'safeTxHash', type: 'bytes32' },
          { name: 'totp', type: 'uint256' },
        ],
      }
      const totp = Math.floor(Date.now() / 3_600_000)
      const signature = await wallet.signTypedData(domain, types, { safeTxHash, totp })
      const url = `${SafeTxServiceModule.baseUrl(SafeFixture.network)}/v2/multisig-transactions/${safeTxHash}/`

      try {
        await axios.delete(url, { ...SafeFixture._requestConfig(), data: { signature } })
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return
        throw error
      }
    })
  },

  async removeAll(hashes: string[]): Promise<void> {
    const failures: unknown[] = []
    for (const hash of hashes) {
      try {
        await SafeFixture.remove(hash)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw Object.assign(new Error('Unable to delete Safe proposals'), { errors: failures })
  },

  async budgetId(): Promise<string> {
    const left = 3_600_000 - (Date.now() % 3_600_000)
    if (left < 300_000) await utils.wait(left + 100)
    return Models.SafeCache.globalBudgetId(Date.now())
  },

  watchOwners(sandbox: SinonSandbox): SinonSpy {
    return sandbox.spy(SafeChainReaderModule, 'readOwners')
  },

  async assertOwners(read: SinonSpy, network = SafeFixture.network, safeAddress = SafeFixture.safeAddress) {
    let owners: string[] | null = null
    for (const call of read.getCalls()) {
      if (call.args[0] === network && call.args[1] === safeAddress) owners = await call.returnValue
    }
    expect(owners).to.be.an('array').and.not.empty
    const members = await Models.SafeMember.find({ network, safeAddress })
    const expected = new Set(owners!)
    expect(members).to.have.length(expected.size)
    for (const owner of expected) {
      let found = 0
      for (const member of members) if (member.memberAddress === owner) found += 1
      expect(found).to.equal(1)
      expect(await Models.Member.findOne({ address: owner })).to.exist
    }
  },

  async keepKnownTransactions(network: NetworksEnum, safeAddress: HexAddress, transactionHashes: string[]) {
    await Models.SafeTransaction.deleteMany({ network, safeAddress, transactionHash: { $nin: transactionHashes } })
  },

  async refresh(
    sandbox: SinonSandbox,
    network: NetworksEnum,
    safeAddress: HexAddress,
    historyPages: number | undefined,
    lastNonce: number,
  ) {
    const read = sandbox.spy(SafeServiceModule, '_readCachedPage')
    try {
      await SafeServiceModule.syncStore(network, safeAddress, historyPages)
      const expected = new Map<string, string>()
      let historyReads = 0
      let next: string | null = null
      const cap = Math.min(Math.max(1, historyPages ?? 1), config.SAFE_API.BACKFILL_HISTORY_PAGES)
      for (const call of read.getCalls()) {
        if (call.args[0].kind !== ISafeReadKind.history) continue
        expect(historyReads < cap).to.equal(true)
        expect(historyReads === 0 || next != null).to.equal(true)
        expect(call.args[0].params.offset).to.equal(historyReads * config.SAFE_API.BACKFILL_PAGE_SIZE)
        if (historyReads === 0 && cap > 1) expect(call.args[0].bypassCache).to.equal(true)
        historyReads += 1
        const page = await call.returnValue
        next = page.next
        for (const row of page.results) expected.set(row.safeTxHash, row.nonce)
      }
      expect(historyReads).to.be.greaterThan(0)
      if (next != null) expect(historyReads).to.equal(cap)
      const stored = await Models.SafeTransaction.find({
        network,
        safeAddress,
        safeTxHash: { $in: [...expected.keys()] },
      })
      expect(stored).to.have.length(expected.size)
      for (const row of stored) {
        expect(row.nonce).to.equal(expected.get(row.safeTxHash))
        expect(row.state).to.equal(ISafeTransactionState.executed)
      }
      const nonces: string[] = []
      for (let nonce = 0; nonce <= lastNonce; nonce += 1) nonces.push(nonce.toString())
      const known = await Models.SafeTransaction.countDocuments({
        network,
        safeAddress,
        nonce: { $in: nonces },
        state: ISafeTransactionState.executed,
      })
      if (known < nonces.length) {
        const page = await SafeServiceModule.readHistory(network, safeAddress, {
          limit: lastNonce + 1,
          offset: 0,
          nonceGte: '0',
          nonceLte: lastNonce.toString(),
        })
        expect(page.meta.stale).to.equal(false)
        expect(page.results).to.have.length(nonces.length)
        await SafeTransactionsModule.record(network, safeAddress, page.results, Date.parse(page.meta.fetchedAt))
      }
    } finally {
      read.restore()
    }
  },

  async assertNextNonce(result: ISafeNextNonceResponse, get: SinonSpy, start: number, read: SinonSpy) {
    expect(result.currentNonce).to.match(/^\d+$/)
    expect(result.nextNonce).to.match(/^\d+$/)
    expect(get.callCount).to.be.greaterThan(start)
    expect(read.callCount).to.be.at.least(2)
    const before = BigInt(await read.getCall(read.callCount - 2).returnValue)
    const after = BigInt(await read.lastCall.returnValue)
    expect(result.currentNonce).to.equal((before > after ? before : after).toString())
    const occupied = new Set<string>()
    for (let index = start; index < get.callCount; index += 1) {
      const page = await get.getCall(index).returnValue
      for (const row of page.results) occupied.add(BigInt(row.nonce).toString())
    }
    let expected = BigInt(result.currentNonce)
    while (occupied.has(expected.toString())) expected += 1n
    expect(result.nextNonce).to.equal(expected.toString())
    expect(result.meta.stale).to.equal(false)
  },

  async queue(hashes: string[]): Promise<Pick<ISafeQueueResponse, 'results' | 'meta'>> {
    const results: ISafeMultisigTransaction[] = []
    let offset = 0
    let page: ISafeQueueResponse
    const deadline = Date.now() + 120_000
    do {
      page = await SafeController.getQueue(SafeFixture.network, SafeFixture.safeAddress, 100, offset)
      for (const row of page.results) if (hashes.includes(row.safeTxHash)) results.push(row)
      offset += page.results.length
      if (page.next && !page.results.length) throw new Error('Safe queue pagination stopped early')
      if (Date.now() > deadline) throw new Error('Safe queue scan timed out')
    } while (page.next)
    return { results, meta: page.meta }
  },

  async waitFor<T>(check: () => Promise<T>, ms: number, everyMs: number): Promise<T> {
    const deadline = Date.now() + ms
    let last: T
    do {
      last = await check()
      if (last) return last
      await utils.wait(everyMs)
    } while (Date.now() < deadline)
    throw new Error(`waitFor timed out after ${ms}ms; last=${JSON.stringify(last)}`)
  },
}

export default SafeFixture
