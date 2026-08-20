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
  /** Upper bound on provided accounts. Each costs one hasRole eth_call per gating role. */
  MAX_ACCOUNTS: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_MAX_ACCOUNTS', 50),
  /** Targets scanned at once. Each costs an explorer lookup plus up to MAX_PROBES eth_calls. */
  SCAN_CONCURRENCY: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_SCAN_CONCURRENCY', 4),
  /** Passed to the detector as maxProbes. */
  MAX_PROBES: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_MAX_PROBES', 64),
  /**
   * Ceiling on members enumerated per role. The count comes from the scanned
   * contract, so an unbounded read lets a target dictate how much we allocate.
   */
  MAX_ROLE_MEMBERS: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_MAX_ROLE_MEMBERS', 256),
  /** Ceiling on bytes32 getters probed as candidate roles, for the same reason. */
  MAX_ROLE_GETTERS: utils.configParser(process.env, 'number', 'SERVICES_ARAGON_WORKSPACE_MAX_ROLE_GETTERS', 128),
}

export default WorkspaceConfig
