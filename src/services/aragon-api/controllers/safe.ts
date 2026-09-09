/**
 * Safe body controller.
 *
 * Holds no logic beyond the hand-off: the reads need RPC providers and Mongo writes, and the API has
 * only the latter, so the work happens in `aragon-gateway` next to the cache and the hourly counter
 * that protect the shared Safe API key. This is the same pattern `contractInfo` and
 * `canCreateProposal` already use.
 */

import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { SafeReadError } from '@modules/safe/safeError'
import {
  EnumQueueName,
  getSafeShortName,
  ISafeErrorCode,
  type IQueueSafeRead,
  type ISafeInfoResponse,
  type ISafeNextNonceResponse,
  ISafeReadKind,
  type ISafeQueueResponse,
} from '@types'

async function read(params: IQueueSafeRead): Promise<unknown> {
  const { network, address, kind, limit, offset } = params

  // Reject before RabbitMQ for chains with no Safe Transaction Service. This is a first-class
  // answer, not a gateway outage, and avoids spending the request timeout on a queue that cannot
  // answer it.
  if (!getSafeShortName(network)) {
    throw new SafeReadError(
      ISafeErrorCode.unsupportedChain,
      `${network} is not served by the Safe transaction service`,
      501,
    )
  }

  const result = await RabbitMQHelper.sendMessage(
    EnumQueueName.safeRead,
    {
      id: `safe-${kind}-${network}-${address}-${String(limit)}-${String(offset)}-${params.to ?? ''}-${params.nonceGte ?? ''}-${params.nonceLte ?? ''}`,
      params,
    },
    { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
  )

  // Null means the consumer never replied - it is down, or the read outran the timeout.
  if (result == null) {
    throw new SafeReadError(ISafeErrorCode.connectionError, 'The Safe read did not complete in time', 502)
  }

  // A reply always arrives as an object, so `safeError` - not the reply itself - marks the failure.
  if (typeof result === 'object' && 'safeError' in result) {
    throw SafeReadError.fromQueueError(result)
  }

  return result
}

const SafeController = {
  async getInfo(network: IQueueSafeRead['network'], address: string): Promise<ISafeInfoResponse> {
    return (await read({ sentAt: Date.now(), network, address, kind: ISafeReadKind.info })) as ISafeInfoResponse
  },

  async getQueue(
    network: IQueueSafeRead['network'],
    address: string,
    limit: number,
    offset: number,
  ): Promise<ISafeQueueResponse> {
    return (await read({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.queue,
      limit,
      offset,
    })) as ISafeQueueResponse
  },

  async getHistory(
    network: IQueueSafeRead['network'],
    address: string,
    filters: { limit: number; offset: number; to?: string; nonceGte?: string; nonceLte?: string },
  ): Promise<ISafeQueueResponse> {
    return (await read({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.history,
      ...filters,
    })) as ISafeQueueResponse
  },

  async getNextNonce(network: IQueueSafeRead['network'], address: string): Promise<ISafeNextNonceResponse> {
    return (await read({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.nextNonce,
    })) as ISafeNextNonceResponse
  },
}

export default SafeController
