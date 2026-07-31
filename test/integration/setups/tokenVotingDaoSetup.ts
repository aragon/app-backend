import logger from '@logger'
import { ethers } from 'ethers'
import { mine } from '../helpers/anvilRpc'
import type { TokenVotingDaoDeployment } from '../types/tokenVotingFixture'
import { createDeployer, deployAdminDao, pspInstall } from './shared/osxBootstrap'

const TOKEN_VOTING_REPO = '0xb7401cD221ceAFC54093168B814Cc3d42579287f'
const TOKEN_VOTING_RELEASE = 1
const TOKEN_VOTING_BUILD = 4

const TOKEN_VOTING_ABI = ['function getVotingToken() view returns (address)', 'function token() view returns (address)']

/**
 * Deploys a fresh DAO on a forked anvil following the Aragon FE flow:
 *   1. createDao with only the Admin plugin (deployer = admin).
 *   2. Through Admin auto-execute, grant PSP root + grant deployer APPLY_INSTALLATION on PSP.
 *   3. Prepare + apply TokenVoting (build 4, plain GovernanceERC20 with 1M minted to deployer).
 *   4. Self-delegate deployer + mine so the proposal snapshot sees the voting power.
 */
export async function setupTokenVotingDao(): Promise<TokenVotingDaoDeployment> {
  const { wallet: deployerWallet, deployer } = await createDeployer()
  const { dao, psp } = await deployAdminDao(deployer, deployerWallet.address)

  // ───────────────── PSP prepare + apply TokenVoting ─────────────────
  const tvInstallData = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'tuple(uint8 votingMode, uint32 supportThreshold, uint32 minParticipation, uint64 minDuration, uint256 minProposerVotingPower)',
      'tuple(address addr, string name, string symbol)',
      'tuple(address[] receivers, uint256[] amounts, bool ensureDelegationOnMint)',
      'tuple(address target, uint8 operation)',
      'uint256',
      'bytes',
      'address[]',
    ],
    [
      { votingMode: 1, supportThreshold: 500_000, minParticipation: 0, minDuration: 3600, minProposerVotingPower: 0 },
      { addr: ethers.ZeroAddress, name: 'Test', symbol: 'TEST' },
      { receivers: [deployerWallet.address], amounts: [10n ** 24n], ensureDelegationOnMint: false },
      { target: dao, operation: 0 },
      0,
      '0x',
      [],
    ],
  )

  const { plugin: tokenVoting } = await pspInstall(
    psp,
    dao,
    { versionTag: { release: TOKEN_VOTING_RELEASE, build: TOKEN_VOTING_BUILD }, pluginSetupRepo: TOKEN_VOTING_REPO },
    tvInstallData,
  )
  logger.info(`TokenVotingDaoSetup: TokenVoting applied at ${tokenVoting}`)

  // ───────────────── Read token, self-delegate, mine ─────────────────
  const tvContract = new ethers.Contract(tokenVoting, TOKEN_VOTING_ABI, deployer)
  let token: string
  try {
    token = await tvContract.getVotingToken()
  } catch {
    token = await tvContract.token()
  }
  logger.info(`TokenVotingDaoSetup: token=${token}`)

  const tokenContract = new ethers.Contract(token, ['function delegate(address)'], deployer)
  await (await tokenContract.delegate(deployerWallet.address)).wait()

  await mine(2, 1)

  return {
    dao,
    tokenVoting,
    token,
    deployer: deployerWallet.address,
    deployerWallet,
    deployerSigner: deployer,
  }
}
