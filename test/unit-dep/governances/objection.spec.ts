import { Models } from '@dbModels'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { IPluginInterfaceType, ISettingStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integ: Objection', function () {
  this.timeout(10000000)
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('Alchemix factory deployment flow', () => {
    // Factory.deployOnce() on Sepolia (single tx, block 11327112):
    // DAO + Multisig + two SPP instances, each with its own TokenVoting + Objection pair.
    // All bodies are installed through the PSP; the Objections never emit settings events
    // (their settings live-proxy to the linked TokenVoting).
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x1F0D1ab1ebbBFeeaD2cc5566dBCb2e7403b42499'
    const tokenAddress = '0xE9351989A6c7E7A45305727269222154A00b6C55'
    const multisigAddress = '0xdF26Fcb5B7b2A013a34c16A2E1D8199a82f3907a'
    const deployBlock = 11327112

    const sppInstances = [
      {
        spp: '0x0d8cD6b8D9D2Af1EFb0b143F8f613CaD94D8729a',
        tokenVoting: '0x51EC00400C180748D280dAFF58e3aEA7eEFB6A07',
        objection: '0x682Adaa655369f0CeCde03369142C598D661a224',
      },
      {
        spp: '0x695b04B46Fe0660c63138e326CCc490239aCd0d6',
        tokenVoting: '0x242B8128279d972708b5E2371Ff7d361d9cE3f4E',
        objection: '0xf3ABbecb2e790d8DAbB3EB4fD2b511f45ffA092B',
      },
    ]

    it('should sync the DAO and correctly identify objection plugins with their settings', async () => {
      const libUtils = new LibUtils({
        daoAddress,
        network,
        config: {
          sandbox,
          blockLimit: deployBlock,
        },
      })

      await libUtils.syncCompleteDao(deployBlock)

      // DAO created from the deploy receipt's DAORegistered event
      const dao = await Models.Dao.findOne({ address: daoAddress, network })
      expect(dao).to.exist

      // All seven plugins are PSP-installed in the single deployOnce tx:
      // 2 SPPs + 2 TokenVotings + 2 Objections + 1 Multisig
      const plugins = await Models.Plugin.find({ daoAddress, network })
      const pluginAddresses = plugins.map(p => p.address)
      const expectedAddresses = [multisigAddress, ...sppInstances.flatMap(i => [i.spp, i.tokenVoting, i.objection])]
      for (const address of expectedAddresses) {
        expect(pluginAddresses).to.include(address)
      }

      // Multisig
      const multisig = plugins.find(p => p.address === multisigAddress)
      expect(multisig?.interfaceType).to.eq(IPluginInterfaceType.multisig)
      expect(multisig?.isObjection).to.not.be.true

      for (const instance of sppInstances) {
        // SPP process with its stage config
        const spp = plugins.find(p => p.address === instance.spp)
        expect(spp?.interfaceType).to.eq(IPluginInterfaceType.spp)

        const tokenVoting = plugins.find(p => p.address === instance.tokenVoting)
        expect(tokenVoting?.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
        expect(tokenVoting?.isObjection).to.not.be.true
        expect(tokenVoting?.tokenAddress).to.eq(tokenAddress)

        const objection = plugins.find(p => p.address === instance.objection)
        expect(objection?.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
        expect(objection?.isObjection).to.be.true
        expect(objection?.tokenAddress).to.eq(tokenAddress)

        const tokenVotingSetting = await Models.Setting.findActive({
          network,
          pluginAddress: instance.tokenVoting,
        })
        expect(tokenVotingSetting).to.exist
        expect(tokenVotingSetting.status).to.eq(ISettingStatus.active)

        const objectionSetting = await Models.Setting.findActive({
          network,
          pluginAddress: instance.objection,
        })
        expect(objectionSetting).to.exist
        expect(objectionSetting.isObjection).to.be.true
        expect(objectionSetting.supportThreshold).to.eq(tokenVotingSetting.supportThreshold)
        expect(objectionSetting.minParticipation).to.eq(tokenVotingSetting.minParticipation)
        expect(objectionSetting.minDuration).to.eq(0)
        expect(objectionSetting.votingMode).to.eq(0)
        expect(objectionSetting.tokenAddress).to.eq(tokenAddress)
      }
    })
  })
})
