import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import TenderlyActions from '@modules/tenderly/actions'
import { IPluginInterfaceType, IPluginStatus, ITenderlyOperation, NetworksEnum } from '@types'
import { DaoList } from '@test/mock/fakeDao'
import { expect } from 'chai'
import { Interface } from 'ethers'

const PLUGIN = '0x3333333333333333333333333333333333333333'
const DAO_ADDRESS = '0x4444444444444444444444444444444444444444'
const FROM = '0x5555555555555555555555555555555555555555'
const network = NetworksEnum.ethereumMainnet
const actions = [
  { to: '0x1111111111111111111111111111111111111111', value: '100', data: '0xabcdef12' },
  { to: '0x2222222222222222222222222222222222222222', value: '0', data: '0x' },
]

const plugin = (changes: Record<string, unknown> = {}) =>
  Models.Plugin.create({
    id: 'plugin-1',
    address: PLUGIN,
    daoAddress: DAO_ADDRESS,
    network,
    interfaceType: IPluginInterfaceType.multisig,
    status: IPluginStatus.installed,
    isSupported: true,
    transactionHash: '0xgrant',
    blockNumber: 10,
    ...changes,
  })

describe('Module: tenderly actions', () => {
  describe('load', () => {
    it('runs plugin actions from the plugin against its own DAO', async () => {
      await plugin()

      const input = await TenderlyActions.load({
        operation: ITenderlyOperation.pluginActions,
        pluginAddress: PLUGIN,
        network,
        actions,
        sentAt: Date.now(),
      })

      expect(input).to.deep.equal({ network, daoAddress: DAO_ADDRESS, from: PLUGIN, actions })
    })

    it('refuses a plugin that is not installed', async () => {
      await plugin({ status: IPluginStatus.uninstalled })

      const thrown: any = await TenderlyActions.load({
        operation: ITenderlyOperation.pluginActions,
        pluginAddress: PLUGIN,
        network,
        actions,
        sentAt: Date.now(),
      }).catch(error => error)

      expect(thrown.message).to.equal('badSimulationRequest')
      expect(thrown.status).to.equal(400)
    })

    it('refuses a Safe process, it has a row per DAO and this route names no DAO', async () => {
      await plugin({ interfaceType: IPluginInterfaceType.safe })

      const thrown: any = await TenderlyActions.load({
        operation: ITenderlyOperation.pluginActions,
        pluginAddress: PLUGIN,
        network,
        actions,
        sentAt: Date.now(),
      }).catch(error => error)

      expect(thrown.message).to.equal('badSimulationRequest')
    })

    it('runs a direct execute from the given caller against an indexed DAO', async () => {
      const dao = DaoList[1]
      await Models.Dao.create(dao)

      const input = await TenderlyActions.load({
        operation: ITenderlyOperation.directExecute,
        daoAddress: dao.address,
        from: FROM,
        network,
        actions,
        sentAt: Date.now(),
      })

      expect(input).to.deep.equal({ network, daoAddress: dao.address, from: FROM, actions })
    })

    it('refuses a DAO that is not indexed', async () => {
      const thrown: any = await TenderlyActions.load({
        operation: ITenderlyOperation.directExecute,
        daoAddress: DAO_ADDRESS,
        from: FROM,
        network,
        actions,
        sentAt: Date.now(),
      }).catch(error => error)

      expect(thrown.message).to.equal('badSimulationRequest')
      expect(thrown.status).to.equal(400)
    })
  })

  describe('build', () => {
    it('wraps the actions in a DAO execute call from the caller', () => {
      const call = TenderlyActions.build({ network, daoAddress: DAO_ADDRESS, from: FROM, actions })

      expect(call).to.include({ to: DAO_ADDRESS, from: FROM, value: '0' })
      const decoded = new Interface(DAO.abi).decodeFunctionData('execute', call.data)
      expect(decoded[1].map((action: any) => [action.to, action.value.toString(), action.data])).to.deep.equal([
        [actions[0].to, '100', '0xabcdef12'],
        [actions[1].to, '0', '0x'],
      ])
      expect(decoded[2]).to.equal(0n)
    })

    it('fills a missing value and calldata with zero', () => {
      const call = TenderlyActions.build({
        network,
        daoAddress: DAO_ADDRESS,
        from: FROM,
        actions: [{ to: actions[0].to } as any],
      })

      const decoded = new Interface(DAO.abi).decodeFunctionData('execute', call.data)
      expect(decoded[1][0].value).to.equal(0n)
      expect(decoded[1][0].data).to.equal('0x')
    })
  })
})
