import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import SafeTxServiceModule from '@modules/safeTxService'
import { SafeGateway } from '@services/aragon-gateway/safe'
import { EnumQueueName, type HexAddress, type IQueueSafeRead, NetworksEnum } from '@types'
import axios from 'axios'
import { Contract, getAddress, TypedDataEncoder, Wallet, ZeroAddress } from 'ethers'
import { type SinonSandbox } from 'sinon'

const safeAbi = [
  'function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)',
]

const SafeFixture = {
  network: NetworksEnum.ethereumSepolia,
  chainId: 11155111,
  safeAddress: '0xE9C78Ac980BDfE01587FdC9a3ebdfA9243cc5f9f' as HexAddress,
  owners: ['0xdca88C8588f97a685209DD8fc99Bd4fe776091C9', '0x5F1680d0c2c5E9d3615a036FbDc7432E7bf246FB'] as HexAddress[],

  stubSafeRead(sandbox: SinonSandbox): void {
    sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (queue, message, options) => {
      if (queue !== EnumQueueName.safeRead || !options?.waitResponse) {
        throw new Error(`Unexpected queue message: ${queue}`)
      }
      return await SafeGateway.read(message.params as IQueueSafeRead)
    })
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
    await axios.post(
      url,
      {
        ...transaction,
        contractTransactionHash: safeTxHash,
        sender: wallet.address,
        signature,
        origin: 'aragon-unit-dep',
      },
      SafeFixture._requestConfig(),
    )

    return { safeTxHash, nonce: transaction.nonce }
  },

  async remove(safeTxHash: string): Promise<void> {
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

    await axios.delete(url, { ...SafeFixture._requestConfig(), data: { signature } })
  },

  async removeLeftovers(): Promise<void> {
    const hashes: string[] = []
    let offset = 0
    let count: number
    do {
      const page = await SafeTxServiceModule.get<{
        count: number
        results: Array<{ safeTxHash: string; origin: string | null; proposer: string | null }>
      }>(SafeFixture.network, `/v2/safes/${SafeFixture.safeAddress}/multisig-transactions/`, {
        executed: false,
        limit: 100,
        offset,
      })
      for (const row of page.results) {
        if (row.origin === 'aragon-unit-dep' && row.proposer === SafeFixture.owners[0]) hashes.push(row.safeTxHash)
      }
      offset += page.results.length
      count = page.count
    } while (offset < count)

    for (const hash of hashes) await SafeFixture.remove(hash)
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
