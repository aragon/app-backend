import config from '@config'
import Utils from '@helpers/utils'
import { EnumConnection, type IService } from '@types'
import WorkspaceAPI from '@workspace/app'
import { setWorkspaceModels } from '@workspace/models'

/**
 * aragon-workspace — control-surface discovery (POC).
 *
 * Needs BLOCKCHAIN as well as MONGODB: scanning reads contracts over RPC.
 * No RabbitMQ — scans run in-process, see WorkspaceScanner.scanInBackground.
 *
 * `name` is deliberately unset so this does not need a slot in EnumServiceName;
 * the runner only uses it to label Prometheus metrics, which the POC has none of.
 */
const AragonWorkspaceService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    setWorkspaceModels()
    return await WorkspaceAPI()
  },

  stop: Utils.noop,
}

export default AragonWorkspaceService
