import utils from '@helpers/utils'

/**
 * Service-local config.
 *
 * Deliberately not in config/common.ts: the POC keeps everything it owns inside
 * this directory, so deleting the service takes its settings with it. If it
 * graduates, these move into the shared config like every other service's.
 */
const WorkspaceConfig = {
  PORT: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_PORT', 3005),
  TIMEOUT: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_TIMEOUT', 120),
  /** Upper bound on addresses accepted in one workspace. */
  MAX_TARGETS: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_MAX_TARGETS', 50),
  /** Targets scanned at once. Each costs an explorer lookup plus up to MAX_PROBES eth_calls. */
  SCAN_CONCURRENCY: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_SCAN_CONCURRENCY', 4),
  /** Passed to the detector as maxProbes. */
  MAX_PROBES: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_MAX_PROBES', 64),
}

export default WorkspaceConfig
