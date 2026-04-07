import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { LogAdmin } from '@plugins/logAdmin'
import { LogGauge } from '@plugins/logGauge'
import { LogLockToVote } from '@plugins/logLockToVote'
import { LogMultiSig } from '@plugins/logMultisig'
import { LogPolicy } from '@plugins/logPolicy'
import { LogSpp } from '@plugins/logSPP'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { MetadataRefetchProcessor } from '@services/aragon-gateway/metadataRefetch'
import { EnumQueueName, IPluginInterfaceType, type IQueuePlugin, ITokenType } from '@types'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'

/**
 * Replaces RabbitMQHelper.sendMessage with an inline router that invokes the same plugin
 * sync handlers the real `aragon-plugins` consumer would. Shared between unit and
 * integration tests so the routing stays in one place.
 *
 * Pass a sandbox to scope the stub to a sinon sandbox; otherwise uses the default sinon.
 */
export function stubRabbitmqSend(sandbox?: SinonSandbox): SinonStub {
  const stubber = sandbox ?? sinon
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
  })
}
