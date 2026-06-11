import { Models } from '@dbModels'
import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { LogAdmin } from '@plugins/logAdmin'
import { LogGauge } from '@plugins/logGauge'
import { LogLockToVote } from '@plugins/logLockToVote'
import { LogMultiSig } from '@plugins/logMultisig'
import { LogPolicy } from '@plugins/logPolicy'
import { LogSpp } from '@plugins/logSPP'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import { MetadataRefetchProcessor } from '@services/aragon-gateway/metadataRefetch'
import {
  EnumQueueName,
  IPluginInterfaceType,
  type IProposalInfo,
  type IQueueDao,
  type IQueueDaoTransactions,
  type IQueueExecutionActions,
  type IQueuePlugin,
  ITokenType,
} from '@types'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'

/**
 * Opt-in routing for the aragon-dao consumer queues. Off by default so the shared stub
 * never triggers heavy network crawls in tests that only enqueue these messages — turn on
 * per integration test that wants the full pipeline driven by a single sync.
 */
export interface StubRabbitmqOptions {
  daoTransactions?: boolean
  daoAssets?: boolean
  proposalActions?: boolean
  executionActions?: boolean
}

/**
 * Replaces RabbitMQHelper.sendMessage with an inline router that invokes the same plugin
 * sync handlers the real `aragon-plugins` consumer would. Shared between unit and
 * integration tests so the routing stays in one place.
 *
 * Pass a sandbox to scope the stub to a sinon sandbox; otherwise uses the default sinon.
 * Pass `options` to additionally route the aragon-dao consumer queues to their real handlers.
 */
export function stubRabbitmqSend(sandbox?: SinonSandbox, options: StubRabbitmqOptions = {}): SinonStub {
  const stubber = sandbox ?? sinon


  if (!(RabbitMQHelper.sendDelayedMessage as any).isSinonProxy) {
    stubber.stub(RabbitMQHelper, 'sendDelayedMessage').callsFake(async (queue: string, job: any, delayMs: number) => {
      if (options.executionActions && queue === EnumQueueName.executionActions) {
        const { id } = job.params as IQueueExecutionActions
        const timer = setTimeout(() => {
          DaoExecutionHandler.decodeExecutionTransaction(id).catch((err: any) =>
            logger.error('stubRabbitmqSend: delayed executionActions delivery failed', { err, id }),
          )
        }, delayMs)
        timer.unref?.()
      }
    })
  }

  if ((RabbitMQHelper.sendMessage as any).isSinonProxy) {
    return RabbitMQHelper.sendMessage as SinonStub
  }

  return stubber.stub(RabbitMQHelper, 'sendMessage').callsFake(async (queue: string, job: any) => {
    if (queue === EnumQueueName.plugins) {
      const { address, network, isHistorical } = job.params as IQueuePlugin

      const plugin = await Models.Plugin.findByAddress(address, network)
      if (!plugin?.interfaceType) {
        logger.error('stubRabbitmqSend: plugin not found', { address, network })
        return
      }

      switch (plugin.interfaceType) {
        case IPluginInterfaceType.admin:
          await LogAdmin.start(plugin)
          break
        case IPluginInterfaceType.multisig:
          await LogMultiSig.start(plugin)
          break
        case IPluginInterfaceType.tokenVoting: {
          const token = await Models.Token.findOne({
            address: plugin.tokenAddress,
            network: plugin.network,
          })
          if ((token?.type === ITokenType.ERC20 || token?.type === ITokenType.escrowAdapter) && token.isGovernance) {
            await LogTokenVoting.start(plugin, token, isHistorical)
          }
          break
        }
        case IPluginInterfaceType.spp:
          await LogSpp.start(plugin)
          break
        case IPluginInterfaceType.lockToVote:
          await LogLockToVote.start(plugin)
          break
        case IPluginInterfaceType.gauge: {
          const token = await Models.Token.findOne({
            address: plugin.tokenAddress,
            network: plugin.network,
          })
          await Promise.all([
            LogGauge.start(plugin, isHistorical),
            LogTokenVoting.runEscrowCrawler(plugin, token, isHistorical),
          ])
          break
        }
        case IPluginInterfaceType.claimer:
        case IPluginInterfaceType.router:
          await LogPolicy.start(plugin.address, plugin.network)
          break
        default:
          break
      }
    }

    if (queue === EnumQueueName.metadataRefetch) {
      await MetadataRefetchProcessor.processRefetch(job.params)
    }

    if (options.daoTransactions && queue === EnumQueueName.daoTransactions) {
      const { daoAddress, network, reset } = job.params as IQueueDaoTransactions
      await DaoTransactions.start({ daoAddress, network, reset })
    }

    if (options.daoAssets && queue === EnumQueueName.daoAssets) {
      const { address, network } = job.params as IQueueDao
      await DaoAssets.start({ daoAddress: address, network })
    }

    if (options.proposalActions && queue === EnumQueueName.proposalActions) {
      const { id } = job.params as IProposalInfo
      await ActionDecoder.proposalActionDecoder(id)
    }
  })
}
