import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import {NetworksEnum, ProposalActionType} from '@types'
import { expect } from 'chai'
import ActionDecoder from "@services/aragon-dao/actionDecoder";
import DecodeActions from "@helpers/decodeAction";
import Web3Helper from "@helpers/web3";
import {ProxyMember} from "@modules/proxyMember";
import {Models} from "@dbModels";
describe('aragon-dao: actionDecoder', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('decodeAction', () => {
    it('should decode action', async () => {
      const action = {
        data: '0x',
        network: NetworksEnum.ethereumSepolia,
        from: '0xfrom',
        to: '0xto',
        value: '0'
      }

      sandbox.stub(Web3Helper, 'getBlockNumber').resolves(1)
      sandbox.stub(DecodeActions.prototype, '_decodeWithAbi').resolves(null)
      sandbox.stub(DecodeActions.prototype, '_decodeFallback').resolves(null)

      const response = await ActionDecoder.decode(action)


      expect(response).to.deep.eq({
        from: action.from!,
        to: action.to,
        data: action.data,
        value: action.value,
        type: ProposalActionType.Unknown,
        inputData: null,
      })
    })

    it('should decode transfer action', async () => {
      const action = {
        data: '0x',
        network: NetworksEnum.ethereumSepolia,
        from: '0xfrom',
        to: '0xto',
        value: '123'
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({
        address: '0x000',
        name: 'ETH',
        symbol: 'ETH',
      })
      sandbox.stub(ProxyMember,'createMember').resolves({
        address: '0xto',
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0xfrom',
      })

      const response = await ActionDecoder.decode(action)

      expect(response.type).to.be.eq(ProposalActionType.Transfer)
    })
  })
})