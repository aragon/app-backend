import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import {
  ErrorKeyEnum,
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  type ITenderlyAction,
  type ITenderlyActionInput,
  ITenderlyOperation,
  type ITenderlyRequest,
} from '@types'
import { ethers, Interface } from 'ethers'

const TenderlyActions = {
  async load(
    request: ITenderlyRequest<ITenderlyOperation.pluginActions | ITenderlyOperation.directExecute>,
  ): Promise<ITenderlyActionInput> {
    if (request.operation === ITenderlyOperation.pluginActions) {
      const plugin = await Models.Plugin.findOne({
        address: request.pluginAddress,
        network: request.network,
        status: IPluginStatus.installed,
        isSupported: true,
        interfaceType: { $ne: IPluginInterfaceType.safe },
      })
      Errors.assertExposable(
        plugin,
        ErrorKeyEnum.badSimulationRequest,
        400,
        'Invalid plugin: must be a valid installed plugin',
      )
      return { network: request.network, daoAddress: plugin.daoAddress, from: plugin.address, actions: request.actions }
    }
    const dao = await Models.Dao.findByAddress(request.daoAddress as HexAddress, request.network)
    Errors.assertExposable(dao, ErrorKeyEnum.badSimulationRequest, 400, 'Invalid DAO: must be an indexed DAO')
    return { network: request.network, daoAddress: dao.address, from: request.from, actions: request.actions }
  },

  build(input: ITenderlyActionInput) {
    return { to: input.daoAddress, from: input.from, value: '0', data: TenderlyActions._encode(input.actions) }
  },

  _encode(actions: ITenderlyAction[]) {
    actions = actions.map((action: ITenderlyAction) => ({
      to: action.to,
      value: action.value || '0',
      data: action.data || '0x',
    }))
    const iFace = new Interface(DAO.abi)
    return iFace.encodeFunctionData('execute', [ethers.id(Date.now().toString()), actions, 0])
  },
}

export default TenderlyActions
