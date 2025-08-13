import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum, ProposalActionType } from '@types'
import { expect } from 'chai'
import ActionDecoder from '@services/aragon-dao/actionDecoder'
import DecodeActions from '@helpers/decodeAction'
import Web3Helper from '@helpers/web3'
import { MemberGovernanceFactory } from '@src/governance'
import { Models } from '@dbModels'
import BlockScoutHelper from '@helpers/blockScout'
import { ProposalHandler } from '@handlers/proposalHandler'

describe('AragonDao: actionDecoder', () => {
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
        value: '0',
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
        value: '123',
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({
        address: '0x000',
        name: 'ETH',
        symbol: 'ETH',
        pickFields: sandbox.stub(),
      })
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves({
        address: '0xto',
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0xfrom',
      })
      sandbox.stub(BlockScoutHelper, 'searchDetails').resolves({
        name: null,
      } as any)
      const response = await ActionDecoder.decode(action)

      expect(response.type).to.be.eq(ProposalActionType.TransferNative)
    })

    it('should return null if decodedData is null', async () => {
      const action = {
        data: '0x',
        network: NetworksEnum.ethereumSepolia,
        from: '0xfrom',
        to: '0xto',
        value: '0',
      }

      const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(1)
      const decodeDataStub = sandbox.stub(DecodeActions.prototype, 'decodeData').resolves(null)

      const response = await ActionDecoder.decode(action)

      expect(getBlockNumberStub.calledOnce).to.be.true
      expect(
        decodeDataStub.calledOnceWith(
          action,
          sinon.match({
            network: action.network,
            daoAddress: action.from,
            pluginAddress: action.to,
            blockNumber: 1,
          }),
        ),
      ).to.be.true
      expect(response).to.be.null
    })
  })

  describe('proposalActionDecoder', () => {
    it('should return null if proposal not found', async () => {
      const id = '123'
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)

      const response = await ActionDecoder.proposalActionDecoder(id)

      expect(response).to.be.null
    })

    it('should call parseActions if proposal found', async () => {
      const id = '123'
      const proposal = {
        id,
        actions: [],
        entityId: id,
      }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposal)
      const parseActionsStub = sandbox.stub(ProposalHandler, 'parseActions').resolves()

      await ActionDecoder.proposalActionDecoder(id)

      expect(parseActionsStub.calledOnceWith(proposal)).to.be.true
    })
  })
})
