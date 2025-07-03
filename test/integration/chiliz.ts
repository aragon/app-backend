import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, IPluginStatus, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { Models } from '@dbModels'
import logger from '@logger'
import Dao from '@models/schema/dao'
import Plugin from '@models/schema/plugin'

describe('Integ: Chiliz', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Chiliz full workflow', async () => {
    const daoAddress = '0x8a77f7Dc00168B162dc558659121aA31878B949F'
    const tokenAddress = '0xA15C3b8b5D43E8EFa529eb0fE873A229424f311F'
    const network = NetworksEnum.chilizMainnet

    const txHashes = [
      '0x5e45339481b42299ed84bca76545bfd3748614da69708d3621c0519a850c19c4', // 24883132
      '0x66af2dab0dd4135e262675ddba71de4a48bf965b2c27f19221c6021000fef665', // 24883161
      '0x34771a12dde0a84be07a1bbef860a8caaee8b141c5b9a0aec5b536f0da55fb33', // 24883168
      '0x7bb9a12317b8c5af349485427f3ef5a014f0671ccd2984b33fd74c41cd456482', // 24883178
      '0xf8d82988c91f1a92d6d5ecc1fb29853a685efe8b7257e4f8d316f7f18a1e34af', // 24883228
      '0x36df3a6a453123288a5efb682a7426905c79d37e7f4db3554e42e5785fbff28b', // 24883235
      '0x02d5e3c344bf1b8be708a5f5fe0b72f860523abae85bdcb62d32cdd26778ee66', // 24883241
      '0xb3fda3d5811e27fffed4e3cdfcac0b29eb5e28823df2373c4d12d3dac9ed3547', // 24883249
      '0x357c1f2e57eee1440167682b3cad3fa77cc3d9540ada133f3b5598adc085c34d', // 24883256
    ]

    let dbDao: Dao | null = null
    let dbPlugins: Plugin[] | null = null

    for (const txHash of txHashes) {
      const txReceipts = await Web3Helper.getTransactionReceipt(txHash, network)
      const logsDaoInstall = await UnitDepUtils.parseLogsByConfig(txReceipts?.logs! as any, network)

      for (const ev of logsDaoInstall) {
        await ev.handler(ev.event, ev.info)

        logger.info('Event processed', {
          event: ev.event.fragment.name,
          handler: ev.handler.name,
          info: ev.info,
          network: network,
        })

        if (ev.event.fragment.name === 'DAORegistered') {
          dbDao = await Models.Dao.findByAddress(daoAddress, network)
          expect(dbDao).to.exist
          expect(dbDao?.ens).to.be.null
          expect(dbDao?.metadataIpfs.startsWith('ipfs://')).to.be.true
          expect(dbDao?.avatar.startsWith('ipfs://')).to.be.true
          expect(dbDao?.metrics?.tvlUSD).to.eq(0)
          expect(dbDao?.metrics?.proposalsCreated).to.eq(0)
          expect(dbDao?.metrics?.proposalsExecuted).to.eq(0)
          expect(dbDao?.metrics?.uniqueVoters).to.eq(0)
          expect(dbDao?.metrics?.votes).to.eq(0)
          expect(dbDao?.metrics?.members).to.eq(0)

          // check creator was saved
          const memberCreator = await Models.Member.findByAddress(dbDao?.creatorAddress)
          expect(memberCreator).to.exist
        }
      }
    }

    // expect all plugins to be installed
    dbPlugins = await Models.Plugin.find({
      daoAddress,
      network,
    })!
    expect(dbPlugins).to.have.lengthOf(4)

    // check admin plugin
    const adminPlugin = dbPlugins?.find((plugin: any) => plugin.interfaceType === IPluginInterfaceType.admin)
    expect(adminPlugin).to.be.exist
    expect(adminPlugin?.isSupported).to.be.true
    expect(adminPlugin?.status).to.eq(IPluginStatus.installed)
    expect(adminPlugin?.isProcess).to.be.true
    expect(adminPlugin?.isBody).to.be.true
    expect(adminPlugin?.isSubPlugin).to.be.false

    // check spp plugin
    const sppPlugin = dbPlugins?.find((plugin: any) => plugin.interfaceType === IPluginInterfaceType.spp)
    expect(sppPlugin).to.be.exist
    expect(sppPlugin?.isSupported).to.be.true
    expect(sppPlugin?.status).to.eq(IPluginStatus.installed)
    expect(sppPlugin?.processKey).to.exist
    expect(sppPlugin?.isProcess).to.be.true
    expect(sppPlugin?.isBody).to.be.false
    expect(sppPlugin?.isSubPlugin).to.be.false
    expect(sppPlugin?.subPlugins.length).to.eq(2)

    // check multisig plugin
    const multisigPlugin = dbPlugins?.find((plugin: any) => plugin.interfaceType === IPluginInterfaceType.multisig)
    expect(multisigPlugin).to.be.exist
    expect(multisigPlugin?.isSupported).to.be.true
    expect(multisigPlugin?.status).to.eq(IPluginStatus.installed)
    expect(multisigPlugin?.processKey).to.be.null
    expect(multisigPlugin?.isProcess).to.be.true
    expect(multisigPlugin?.isBody).to.be.true
    expect(multisigPlugin?.isSubPlugin).to.be.true
    expect(multisigPlugin?.parentPlugin).to.eq(sppPlugin?.address)
    expect(multisigPlugin?.stageIndex).to.eq(0)

    // check tokenVoting plugin
    const tokenVotingPlugin = dbPlugins?.find(
      (plugin: any) => plugin.interfaceType === IPluginInterfaceType.tokenVoting,
    )
    expect(tokenVotingPlugin).to.be.exist
    expect(tokenVotingPlugin?.isSupported).to.be.true
    expect(tokenVotingPlugin?.status).to.eq(IPluginStatus.installed)
    expect(tokenVotingPlugin?.processKey).to.be.null
    expect(tokenVotingPlugin?.tokenAddress).to.eq(tokenAddress)
    expect(tokenVotingPlugin?.isProcess).to.be.true
    expect(tokenVotingPlugin?.isBody).to.be.true
    expect(tokenVotingPlugin?.isSubPlugin).to.be.true
    expect(tokenVotingPlugin?.parentPlugin).to.eq(sppPlugin?.address)
    expect(tokenVotingPlugin?.stageIndex).to.eq(1)

    // check pluginSlugs created for each plugin
    const pluginSlugs = await Models.PluginSlug.find({ daoAddress, network })
    expect(pluginSlugs).to.have.lengthOf(4)

    // check governance token
    const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network)
    expect(token).to.exist
    expect(token.skipFetchRate).to.be.true
    expect(token.totalSupply).to.eq('1000000000000000000')
    expect(token.priceUsd).to.eq('0')
    expect(token.blockNumber).to.not.eq(0)
    expect(token.transactionHash).to.exist
    expect(token.holders).to.eq(1)

    // check dao members
    const membersCount = await Models.DaoMemberMapping.countUniqueMembers(daoAddress, network)
    expect(membersCount).to.eq(1)

    // we should have 2 votes: one for multisig and one for tokenVoting
    const votes = await Models.Vote.find({ daoAddress, network })
    expect(votes.length).to.eq(2)

    const multisigVote = votes.find(v => v.pluginAddress === multisigPlugin?.address)
    expect(multisigVote).to.exist

    const tokenVotingVote = votes.find(v => v.pluginAddress === tokenVotingPlugin?.address)
    expect(tokenVotingVote).to.exist
    expect(tokenVotingVote.votingPower).to.eq('1000000000000000000')

    // check admin proposal
    const adminProposals = await Models.Proposal.find({ pluginAddress: adminPlugin?.address, network })
    expect(adminProposals.length).to.eq(1)
    const adminProposal = adminProposals[0]
    expect(adminProposal.incrementalId).to.eq(0)
    expect(adminProposal?.title).to.exist
    expect(adminProposal?.metadataUri.startsWith('ipfs://')).to.be.true
    expect(adminProposal?.isSubProposal).to.be.false
    expect(adminProposal?.executed.status).to.be.true
    expect(adminProposal?.snapshot.membersCount).to.eq(1)
    expect(adminProposal?.actions.length).to.eq(adminProposal?.rawActions.length)

    // check spp proposal
    const sppProposals = await Models.Proposal.find({ pluginAddress: sppPlugin?.address, network })
    expect(sppProposals.length).to.eq(1)
    const sppProposal = sppProposals[0]
    expect(sppProposal.incrementalId).to.eq(0)
    expect(sppProposal?.metadataUri.startsWith('ipfs://')).to.be.true
    expect(sppProposal?.title).to.exist
    expect(sppProposal?.isSubProposal).to.be.false
    expect(sppProposal?.executed.status).to.be.true
    expect(sppProposal?.subProposals.length).to.eq(2)
    expect(sppProposal?.stageExecutions[0].status).to.be.true
    expect(sppProposal?.stageExecutions[0].stageIndex).to.eq(0)
    expect(sppProposal?.stageIndex).to.eq(1)
    expect(sppProposal?.totalStages).to.eq(2)
    expect(sppProposal?.lastStageTransition).to.exist

    // check multisig proposal
    const multisigProposals = await Models.Proposal.find({ pluginAddress: multisigPlugin?.address, network })
    expect(multisigProposals.length).to.eq(1)
    const multisigProposal = multisigProposals[0]
    expect(multisigProposal.incrementalId).to.eq(0)
    expect(multisigProposal.stageIndex).to.eq(0)
    expect(multisigProposal.parentProposal.proposalIndex).to.exist
    expect(multisigProposal?.metadataUri).to.exist
    expect(multisigProposal?.executed.status).to.be.true
    expect(multisigProposal?.isSubProposal).to.be.true
    expect(multisigProposal?.actions.length).to.eq(multisigProposal?.rawActions.length)
    expect(multisigProposal?.settings.onlyListed).to.be.true
    expect(multisigProposal?.settings.minApprovals).to.eq(1)
    expect(multisigProposal?.snapshot.membersCount).to.eq(1)
    expect(multisigProposal?.parentProposal.proposalIndex).to.eq(sppProposal?.proposalIndex)

    // check tokenVoting proposal
    const tokenVotingProposals = await Models.Proposal.find({ pluginAddress: tokenVotingPlugin?.address, network })
    expect(tokenVotingProposals.length).to.eq(1)
    const tokenVotingProposal = tokenVotingProposals[0]
    expect(tokenVotingProposal.incrementalId).to.eq(0)
    expect(tokenVotingProposal.stageIndex).to.eq(1)
    expect(tokenVotingProposal?.executed.status).to.be.false
    expect(tokenVotingProposal?.isSubProposal).to.be.true
    expect(tokenVotingProposal?.snapshot.totalSupply).to.eq('1000000000000000000')
    expect(tokenVotingProposal?.metrics.totalVotes).to.eq(1)
    expect(tokenVotingProposal?.metrics.missingVotes).to.eq(0)
    expect(tokenVotingProposal?.metrics.votesByOption[0].type).to.eq(2)
    expect(tokenVotingProposal?.metrics.votesByOption[0].totalVotes).to.eq(1)
    expect(tokenVotingProposal?.metrics.votesByOption[0].totalVotingPower).to.eq('1000000000000000000')
    expect(tokenVotingProposal?.parentProposal.proposalIndex).to.eq(sppProposal?.proposalIndex)

    // check dao transactions
    const transactions = await Models.Transaction.find({ network, daoAddress })
    expect(transactions.length).to.eq(4)

    const depositNative = transactions.find(
      tx => tx.type === ITransactionType.deposit && tx.category === ITransactionCategory.External,
    )
    expect(depositNative.value).to.eq('1.0')
    expect(depositNative.token.snapshot.priceUsd).to.eq('0')
    expect(depositNative.token.symbol).to.eq('CHZ')
    expect(depositNative.amountUsd).to.eq('0.00')

    const depositErc20 = transactions.find(
      tx => tx.type === ITransactionType.deposit && tx.category === ITransactionCategory.ERC20,
    )
    expect(depositErc20.value).to.eq('0.1')
    expect(depositErc20.token.snapshot.priceUsd).to.eq('0')
    expect(depositErc20.token.symbol).to.eq('TV')
    expect(depositErc20.amountUsd).to.eq('0.00')

    const withdrawNative = transactions.find(
      tx => tx.type === ITransactionType.withdraw && tx.category === ITransactionCategory.Internal,
    )
    expect(withdrawNative.value).to.eq('1.0')
    expect(withdrawNative.token.snapshot.priceUsd).to.eq('0')
    expect(withdrawNative.token.symbol).to.eq('CHZ')
    expect(withdrawNative.amountUsd).to.eq('0.00')

    const withdrawErc20 = transactions.find(
      tx => tx.type === ITransactionType.withdraw && tx.category === ITransactionCategory.ERC20,
    )
    expect(withdrawErc20.value).to.eq('0.1')
    expect(withdrawErc20.token.snapshot.priceUsd).to.eq('0')
    expect(withdrawErc20.token.symbol).to.eq('TV')
    expect(withdrawErc20.amountUsd).to.eq('0.00')

    const assets = await Models.Asset.find({ network, daoAddress })
    expect(assets.length).to.eq(0)

    // TODO:
    // query and check all settings field for all plugins
    // check member metrics
    // check member balances

    // check daos members
    dbDao = await dbDao?.reload()
    expect(dbDao?.metrics?.tvlUSD).to.eq(0)
    expect(dbDao?.metrics?.proposalsCreated).to.eq(2)
    expect(dbDao?.metrics?.proposalsExecuted).to.eq(2)
    expect(dbDao?.metrics?.uniqueVoters).to.eq(2) // TODO: check if correct
    expect(dbDao?.metrics?.votes).to.eq(2)
    expect(dbDao?.metrics?.members).to.eq(1)

    logger.verbose('Chiliz end', { id: dbDao?.id })
  })
})
