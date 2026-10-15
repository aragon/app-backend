import { Models } from '@dbModels'
import PluginDetector from '@helpers/pluginDetector'
import ProviderModule from '@modules/provider'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import {
  ICollectionNames,
  IPluginInterfaceType,
  IPluginStatus,
  ISafeTransactionState,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { impersonate, resetFork, setBalance } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { waitForOne } from '../helpers/dbWaiters'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'

const NETWORK = NetworksEnum.ethereumMainnet

/**
 * A real Safe on mainnet, so the fork has it with its real proxy bytecode and its real version.
 * Nothing here needs its keys: on a fork the owners are impersonated, and a Safe accepts a
 * pre-approved hash as a signature, so `approveHash` from each owner stands in for signing.
 */
const SAFE = '0x27CE7C8c1675c3b57046Cf56d96061693B6123e8'

/** Aragon's DAOFactory. Real contract, definitely not a Safe. */
const NOT_A_SAFE = '0x246503df057A9a85E0144b6867a828c99676128B'

/** Only what the test drives. The read surface lives in `@artifacts/Safe`. */
const SAFE_WRITE_ABI = [
  'function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)',
  'function approveHash(bytes32 hashToApprove)',
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)',
  'function nonce() view returns (uint256)',
  'function getOwners() view returns (address[])',
]

/**
 * A Safe reads pre-approved-hash signatures as `r = owner, s = 0, v = 1`, and requires them
 * concatenated in ascending owner order. That is what lets a fork execute without any private key.
 */
const approvedHashSignatures = (owners: string[]): string =>
  ethers.concat(
    [...owners]
      .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
      .map(owner => ethers.concat([ethers.zeroPadValue(owner, 32), ethers.ZeroHash, '0x01'])),
  )

describe('Safe as a process — anvil', function () {
  this.timeout(600_000)
  this.slow(0)

  // `startServices` drops the whole database before it boots anything, so it has to run before a
  // single row is seeded - and once, here, rather than inside the test that needs it.
  before(async () => {
    await resetFork()
    await ProviderModule.connectToAllNetworks()
    await startServices(await getAnvilProvider().getBlockNumber())
  })

  after(() => stopServices())

  describe('reading a real Safe', () => {
    it('brands it SAFE, and an ordinary contract OTHER', async () => {
      expect(await PluginDetector.detectAddressType(SAFE, NETWORK)).to.equal(VotingBodyBrandIdentity.SAFE)
      expect(await PluginDetector.detectAddressType(NOT_A_SAFE, NETWORK)).to.equal(VotingBodyBrandIdentity.OTHER)
    })

    it('reads every field `/info` answers with, on a 1.4.1 Safe', async () => {
      const info = await SafeChainReaderModule.readInfo(NETWORK, SAFE)

      // `readInfo` requires all six reads, so a version it cannot read is a version no body can use.
      // Owners and threshold are live state, so only their shape is asserted, not their values.
      expect(info.version).to.equal('1.4.1')
      expect(info.owners.length).to.be.greaterThan(0)
      expect(info.threshold).to.be.greaterThan(0)
      expect(info.threshold).to.be.at.most(info.owners.length)
      expect(info.guard).to.be.null
    })
  })

  describe('executing through it', () => {
    it('settles the stored row when the Safe says the transaction executed', async () => {
      const provider = getAnvilProvider()
      const safe = new ethers.Contract(SAFE, SAFE_WRITE_ABI, provider)
      const owners: string[] = await safe.getOwners()
      const nonce: bigint = await safe.nonce()

      // A transaction that does nothing: the point is the event, not the effect.
      const call = {
        to: SAFE,
        value: 0n,
        data: '0x',
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
      }
      const safeTxHash: string = await safe.getTransactionHash(
        call.to,
        call.value,
        call.data,
        call.operation,
        call.safeTxGas,
        call.baseGas,
        call.gasPrice,
        call.gasToken,
        call.refundReceiver,
        nonce,
      )

      // The row normally arrives from a queue read, and no Safe transaction service points at a
      // fork - so it is seeded here. What is under test is the handler, not the read path.
      await Models.SafeTransaction.create({
        id: Models.SafeTransaction.buildId(NETWORK, SAFE, safeTxHash),
        network: NETWORK,
        safeAddress: SAFE,
        safeTxHash,
        nonce: nonce.toString(),
        state: ISafeTransactionState.live,
        to: SAFE,
        targets: [SAFE],
        refreshedAt: new Date(),
      })

      // The Safe has to serve a DAO before the handler does anything.
      await Models.Plugin.create({
        address: SAFE,
        daoAddress: NOT_A_SAFE,
        network: NETWORK,
        transactionHash: `0x${'1'.repeat(64)}`,
        blockNumber: 1,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isSupported: true,
        isProcess: true,
      })

      for (const owner of owners) {
        await setBalance(owner, ethers.parseEther('1'))
        const signer = await impersonate(owner)
        await (await safe.connect(signer).getFunction('approveHash')(safeTxHash)).wait()
      }

      const executor = await impersonate(owners[0])
      const receipt = await (
        await safe.connect(executor).getFunction('execTransaction')(
          call.to,
          call.value,
          call.data,
          call.operation,
          call.safeTxGas,
          call.baseGas,
          call.gasPrice,
          call.gasToken,
          call.refundReceiver,
          approvedHashSignatures(owners),
        )
      ).wait()

      await waitForIndexerCatchup(receipt.blockNumber, 180_000)

      const settled = await waitForOne(
        ICollectionNames.SafeTransaction,
        { network: NETWORK, safeTxHash },
        row => row.state === ISafeTransactionState.executed,
      )

      expect(settled.isSuccessful).to.be.true
      expect(settled.transactionHash).to.equal(receipt.hash)
      expect(settled.executionBlockNumber).to.equal(receipt.blockNumber)
      expect(settled.executionDate).to.be.a('string')
    })
  })
})
