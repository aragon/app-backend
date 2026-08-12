import ConditionDetector from '@helpers/conditionDetector'
import SppBodyConditionHelper from '@helpers/sppBodyCondition'
import logger from '@logger'
import type { IPermissionEntityRef } from '@src/types/permission'
import {
  type HexAddress,
  ICollectionNames,
  IConditionInterfaceType,
  type IPermissionResponse,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  type NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import type { Connection } from 'mongoose'

export const ALLOW_FLAG = '0x0000000000000000000000000000000000000002'

const llo = logger.logMeta.bind(null, { service: 'module:PermissionEntityEnrichment' })

type PermissionEntityRole = NonNullable<IPermissionEntityRef['role']>

interface PermissionEntityDaoDoc {
  address?: HexAddress
  name?: string
  avatar?: string
  linkedAccounts?: HexAddress[]
  parentAccount?: HexAddress | null
}

interface PermissionEntitySubPluginDoc {
  addresses?: HexAddress[]
  stageIndex?: number
}

interface PermissionEntityPluginDoc {
  blockNumber?: number
  address?: HexAddress
  daoAddress?: HexAddress
  status?: IPluginStatus
  interfaceType?: IPluginInterfaceType
  name?: string
  isBody?: boolean
  isSubPlugin?: boolean
  parentPlugin?: HexAddress
  stageIndex?: number
  subPlugins?: PermissionEntitySubPluginDoc[]
  conditionAddress?: HexAddress
  proposalCreationConditionAddress?: HexAddress
}

interface PermissionEntityExternalProposerDoc {
  address?: HexAddress
  proposalCreationConditionAddress?: HexAddress
  brandId?: VotingBodyBrandIdentity
}

interface PermissionEntityStagePluginDoc {
  address?: HexAddress
  proposalCreationConditionAddress?: HexAddress
  brandId?: VotingBodyBrandIdentity
}

interface PermissionEntityStageDoc {
  stageIndex?: number
  plugins?: PermissionEntityStagePluginDoc[]
}

interface PermissionEntitySettingDoc {
  pluginAddress?: HexAddress
  externalProposers?: PermissionEntityExternalProposerDoc[]
  stages?: PermissionEntityStageDoc[]
}

interface PermissionEntityContractDoc {
  address?: HexAddress
  bytecode?: string
}

interface PermissionEntityParentContext {
  address: HexAddress
  name?: string
  interfaceType?: IPluginInterfaceType
  stageIndex?: number
}

interface PermissionEntityConditionContext {
  parent?: PermissionEntityParentContext
  status?: IPermissionEntityRef['status']
}

interface PermissionEntityMetadataContext {
  brandId?: VotingBodyBrandIdentity
  proposalCreationConditionAddress?: HexAddress
}

export const PermissionEntityEnrichment = {
  pluginLifecycleStatus(status?: IPluginStatus): IPermissionEntityRef['status'] {
    if (status === IPluginStatus.installed) return 'installed'
    if (status === IPluginStatus.uninstalled) return 'uninstalled'
    if (status) return 'historical'
    return 'unknown'
  },

  createDaoEntity(address: HexAddress, role: PermissionEntityRole, dao?: PermissionEntityDaoDoc) {
    const entity: IPermissionEntityRef = { address, layer: 'dao', role }
    if (dao?.name) entity.label = dao.name
    if (dao?.avatar) entity.avatarSrc = dao.avatar
    return entity
  },

  createPluginEntity(
    address: HexAddress,
    role: PermissionEntityRole,
    plugin: PermissionEntityPluginDoc,
    layer: 'topLevelPlugin' | 'historicalPlugin',
  ) {
    const entity: IPermissionEntityRef = {
      address,
      layer,
      role,
      status: this.pluginLifecycleStatus(plugin.status),
    }
    const fallbackLabel = plugin.interfaceType || 'Plugin'
    entity.label =
      layer === 'historicalPlugin' ? `Historical ${plugin.name || fallbackLabel}` : plugin.name || fallbackLabel
    if (plugin.interfaceType) entity.interfaceType = plugin.interfaceType
    return entity
  },

  createParentedEntity(
    address: HexAddress,
    role: PermissionEntityRole,
    layer: 'processInternal' | 'condition' | 'externalActor',
    parent?: PermissionEntityParentContext,
    plugin?: PermissionEntityPluginDoc,
    status?: IPermissionEntityRef['status'],
    metadata?: PermissionEntityMetadataContext,
  ) {
    const entity: IPermissionEntityRef = { address, layer, role }
    if (layer === 'processInternal') entity.label = plugin?.name ?? 'Process internal'
    if (layer === 'condition') entity.label = address === ALLOW_FLAG ? 'Allow flag' : 'Condition contract'
    if (layer === 'externalActor') entity.label = 'External proposer'
    entity.status = status || (layer === 'condition' && address === ALLOW_FLAG ? 'unknown' : 'installed')
    if (plugin?.interfaceType) entity.interfaceType = plugin.interfaceType
    if (parent?.address) entity.parentPluginAddress = parent.address
    if (parent?.name) entity.parentPluginName = parent.name
    if (parent?.interfaceType) entity.parentInterfaceType = parent.interfaceType
    if (parent?.stageIndex !== undefined) entity.stageIndex = parent.stageIndex
    if (metadata?.brandId) entity.brandId = metadata.brandId
    if (metadata?.proposalCreationConditionAddress) {
      entity.proposalCreationConditionAddress = metadata.proposalCreationConditionAddress
    }
    return entity
  },

  createFallbackEntity(address: HexAddress, role: PermissionEntityRole, contract?: PermissionEntityContractDoc) {
    if (contract?.bytecode && contract.bytecode !== '0x') {
      return {
        address,
        layer: 'contract',
        label: 'Unresolved contract',
        status: 'unknown',
        role,
      } satisfies IPermissionEntityRef
    }
    return {
      address,
      layer: 'unknown',
      label: 'Unknown address',
      status: 'unknown',
      role,
    } satisfies IPermissionEntityRef
  },

  async enrichSppConditionData(
    rows: IPermissionResponse[],
    plugins: PermissionEntityPluginDoc[],
    network: NetworksEnum,
  ): Promise<IPermissionResponse[]> {
    const sppProposalConditions = new Set(
      plugins
        .filter(
          plugin => plugin.status === IPluginStatus.installed && plugin.interfaceType === IPluginInterfaceType.spp,
        )
        .map(plugin => plugin.proposalCreationConditionAddress?.toLowerCase())
        .filter((address): address is string => Boolean(address)),
    )
    const candidateAddresses = [
      ...new Set(
        rows
          .filter(row => row.condition?.conditionType === 'unknown')
          .map(row => row.conditionAddress)
          .filter(
            (address): address is HexAddress => Boolean(address) && sppProposalConditions.has(address!.toLowerCase()),
          ),
      ),
    ]

    const resolvedConditions = new Map<string, NonNullable<IPermissionResponse['condition']>>()
    await Promise.all(
      candidateAddresses.map(async address => {
        try {
          const conditionType = await ConditionDetector.detect(address, network)
          if (conditionType !== IConditionInterfaceType.sppRule) return

          const rules = await SppBodyConditionHelper.readSppRules(address, network)
          resolvedConditions.set(address.toLowerCase(), { conditionType: 'spp-rule', rules })
        } catch (error) {
          logger.warn('Failed to enrich SPP permission condition', llo({ address, network, error }))
        }
      }),
    )

    return rows.map(row => {
      const condition = row.conditionAddress && resolvedConditions.get(row.conditionAddress.toLowerCase())
      return condition ? { ...row, condition } : row
    })
  },

  async enrich(
    db: Connection,
    rows: IPermissionResponse[],
    filter: { daoAddress: HexAddress; network: NetworksEnum },
  ): Promise<IPermissionResponse[]> {
    if (rows.length === 0) return rows

    const addresses = [
      ...new Set(
        rows
          .flatMap(row => [row.whoAddress, row.whereAddress, row.conditionAddress || ALLOW_FLAG])
          .filter((address): address is HexAddress => Boolean(address)),
      ),
    ]
    const daoLookupAddresses = [...new Set([...addresses, filter.daoAddress])]

    const [daoDocs, plugins, settings, contracts] = await Promise.all([
      db
        .collection<PermissionEntityDaoDoc>(ICollectionNames.Dao)
        .find({ network: filter.network, address: { $in: daoLookupAddresses } })
        .toArray(),
      db
        .collection<PermissionEntityPluginDoc>(ICollectionNames.Plugin)
        .find({ daoAddress: filter.daoAddress, network: filter.network })
        .toArray(),
      db
        .collection<PermissionEntitySettingDoc>(ICollectionNames.Setting)
        .find({ daoAddress: filter.daoAddress, network: filter.network, status: ISettingStatus.active })
        .toArray(),
      db
        .collection<PermissionEntityContractDoc>(ICollectionNames.Contract)
        .find({ network: filter.network, address: { $in: addresses } })
        .toArray(),
    ])

    const daoByAddress = new Map<string, PermissionEntityDaoDoc>()
    for (const dao of daoDocs) {
      if (dao.address) daoByAddress.set(dao.address, dao)
    }

    const rootDao = daoByAddress.get(filter.daoAddress)
    const daoEntityAddresses = new Set(
      [filter.daoAddress, rootDao?.parentAccount, ...(rootDao?.linkedAccounts || [])].filter(
        (address): address is string => Boolean(address),
      ),
    )

    const sortedPlugins = [...plugins].sort((left, right) => {
      const statusDelta =
        (right.status === IPluginStatus.installed ? 1 : 0) - (left.status === IPluginStatus.installed ? 1 : 0)
      if (statusDelta !== 0) return statusDelta
      return (right.blockNumber || 0) - (left.blockNumber || 0)
    })
    const pluginByAddress = new Map<string, PermissionEntityPluginDoc>()
    for (const plugin of sortedPlugins) {
      if (plugin.address && !pluginByAddress.has(plugin.address)) pluginByAddress.set(plugin.address, plugin)
    }

    const contractByAddress = new Map<string, PermissionEntityContractDoc>()
    for (const contract of contracts) {
      if (contract.address) contractByAddress.set(contract.address, contract)
    }

    const parentContext = (
      plugin?: PermissionEntityPluginDoc,
      stageIndex?: number,
    ): PermissionEntityParentContext | undefined => {
      if (!plugin?.address) return undefined
      return {
        address: plugin.address,
        name: plugin.name,
        interfaceType: plugin.interfaceType,
        stageIndex,
      }
    }

    const processInternalByAddress = new Map<
      string,
      { parent?: PermissionEntityParentContext; plugin?: PermissionEntityPluginDoc } & PermissionEntityMetadataContext
    >()
    const conditionByAddress = new Map<string, PermissionEntityConditionContext>()
    const externalActorByAddress = new Map<
      string,
      (PermissionEntityMetadataContext & { parent?: PermissionEntityParentContext }) | undefined
    >()

    for (const plugin of sortedPlugins) {
      const parentPlugin = plugin.parentPlugin ? pluginByAddress.get(plugin.parentPlugin) : undefined

      if (
        plugin.status === IPluginStatus.installed &&
        plugin.address &&
        (plugin.isBody || plugin.isSubPlugin || plugin.parentPlugin)
      ) {
        processInternalByAddress.set(plugin.address, {
          parent: parentContext(parentPlugin, plugin.stageIndex),
          plugin,
        })
      }

      if (plugin.status === IPluginStatus.installed) {
        for (const subPlugin of plugin.subPlugins || []) {
          for (const address of subPlugin.addresses || []) {
            if (address && !processInternalByAddress.has(address)) {
              processInternalByAddress.set(address, {
                parent: parentContext(plugin, subPlugin.stageIndex),
              })
            }
          }
        }
      }

      const pluginParent = parentContext(plugin)
      for (const address of [plugin.conditionAddress, plugin.proposalCreationConditionAddress]) {
        if (address && !conditionByAddress.has(address)) {
          conditionByAddress.set(address, {
            parent: pluginParent,
            status: this.pluginLifecycleStatus(plugin.status),
          })
        }
      }
    }

    for (const setting of settings) {
      const parentPlugin = setting.pluginAddress ? pluginByAddress.get(setting.pluginAddress) : undefined
      for (const proposer of setting.externalProposers || []) {
        if (proposer.address) {
          externalActorByAddress.set(proposer.address, {
            parent: parentContext(parentPlugin),
            brandId: VotingBodyBrandIdentity.SAFE,
            proposalCreationConditionAddress: proposer.proposalCreationConditionAddress,
          })
        }

        const conditionAddress = proposer.proposalCreationConditionAddress
        if (conditionAddress && !conditionByAddress.has(conditionAddress)) {
          conditionByAddress.set(conditionAddress, { parent: parentContext(parentPlugin), status: 'installed' })
        }
      }

      for (const stage of setting.stages || []) {
        for (const stagePlugin of stage.plugins || []) {
          const address = stagePlugin.address
          if (address) {
            const existing = processInternalByAddress.get(address)
            processInternalByAddress.set(address, {
              parent: existing?.parent || parentContext(parentPlugin, stage.stageIndex),
              plugin: existing?.plugin,
              brandId: stagePlugin.brandId || existing?.brandId,
              proposalCreationConditionAddress:
                stagePlugin.proposalCreationConditionAddress || existing?.proposalCreationConditionAddress,
            })
          }

          const conditionAddress = stagePlugin.proposalCreationConditionAddress
          if (conditionAddress && !conditionByAddress.has(conditionAddress)) {
            conditionByAddress.set(conditionAddress, {
              parent: parentContext(parentPlugin, stage.stageIndex),
              status: 'installed',
            })
          }
        }
      }
    }

    const resolve = (address: HexAddress, role: PermissionEntityRole) => {
      if (role === 'condition' && address === ALLOW_FLAG) {
        return this.createParentedEntity(address, role, 'condition')
      }

      if (daoEntityAddresses.has(address)) {
        return this.createDaoEntity(address, role, daoByAddress.get(address))
      }

      const directPlugin = pluginByAddress.get(address)
      const internal = processInternalByAddress.get(address)
      if (internal) {
        return this.createParentedEntity(
          address,
          role,
          'processInternal',
          internal.parent,
          internal.plugin ?? directPlugin,
          undefined,
          {
            brandId: internal.brandId,
            proposalCreationConditionAddress: internal.proposalCreationConditionAddress,
          },
        )
      }

      const isTopLevelInstalledPlugin = Boolean(
        directPlugin &&
          directPlugin.status === IPluginStatus.installed &&
          !directPlugin.isBody &&
          !directPlugin.isSubPlugin &&
          !directPlugin.parentPlugin,
      )
      if (isTopLevelInstalledPlugin && directPlugin) {
        return this.createPluginEntity(address, role, directPlugin, 'topLevelPlugin')
      }

      const condition = conditionByAddress.get(address)
      if (conditionByAddress.has(address)) {
        return this.createParentedEntity(address, role, 'condition', condition?.parent, undefined, condition?.status)
      }

      const externalActor = externalActorByAddress.get(address)
      if (externalActorByAddress.has(address)) {
        return this.createParentedEntity(address, role, 'externalActor', externalActor?.parent, undefined, 'unknown', {
          brandId: externalActor?.brandId,
          proposalCreationConditionAddress: externalActor?.proposalCreationConditionAddress,
        })
      }

      if (directPlugin && directPlugin.status !== IPluginStatus.preInstall) {
        return this.createPluginEntity(address, role, directPlugin, 'historicalPlugin')
      }

      return this.createFallbackEntity(address, role, contractByAddress.get(address))
    }

    const rowsWithConditionData = await this.enrichSppConditionData(rows, sortedPlugins, filter.network)

    return rowsWithConditionData.map(row => ({
      ...row,
      who: resolve(row.whoAddress, 'who'),
      where: resolve(row.whereAddress, 'where'),
      conditionEntity: resolve(row.conditionAddress || ALLOW_FLAG, 'condition'),
    }))
  },
}
