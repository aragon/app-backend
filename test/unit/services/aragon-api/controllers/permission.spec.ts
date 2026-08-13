import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import PermissionController from '@services/aragon-api/controllers/permission'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Permission', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getPermissionsByDao', () => {
    it('should get permissions by dao address and network', async () => {
      const daoAddress = '0x5B72fbB65339a8A0032C2d823520d697a0265c50'
      const network = NetworksEnum.ethereumSepolia
      const paginationParams = {
        pageSize: 10,
        page: 1,
      }

      const mockResponse = {
        data: [
          {
            daoAddress,
            network,
            permissionId: '0xPERM1',
            whoAddress: '0xWHO1',
            whereAddress: '0xWHERE1',
          },
        ],
        metadata: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 },
      }

      const stubFindWithPagination = sandbox.stub(Models.DaoPermission, 'findWithPagination').resolves(mockResponse)

      const result = await PermissionController.getPermissionsByDao(daoAddress, network, paginationParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams: { daoAddress, network },
          paginationParams,
        }),
      ).to.be.true
      expect(result.metadata).to.deep.equal(mockResponse.metadata)

      // The controller enriches what the model returns raw, so each row gains its resolved entities.
      const [row] = result.data
      expect(row.permissionId).to.equal('0xPERM1')
      expect(row.who?.address).to.equal('0xWHO1')
      expect(row.where?.address).to.equal('0xWHERE1')
      expect(row.conditionEntity?.label).to.equal('Allow flag')
    })

    it('should pass pagination params correctly', async () => {
      const daoAddress = '0xDAO123'
      const network = NetworksEnum.ethereumMainnet
      const paginationParams = {
        pageSize: 20,
        page: 2,
        sort: 'blockNumber',
        order: 'desc',
      }

      const mockResponse = {
        data: [],
        metadata: { page: 2, pageSize: 20, totalPages: 0, totalRecords: 0 },
      }

      const stubFindWithPagination = sandbox.stub(Models.DaoPermission, 'findWithPagination').resolves(mockResponse)

      const result = await PermissionController.getPermissionsByDao(daoAddress, network, paginationParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(stubFindWithPagination.args[0][0]).to.deep.equal({
        extraParams: { daoAddress, network },
        paginationParams,
      })
      expect(result).to.deep.equal(mockResponse)
    })
  })

  describe('resolveSppRules', () => {
    const network = NetworksEnum.ethereumSepolia
    const conditionAddress = '0xb28a9D4463c03790eC7CA725eDb7A46b0dB6dAaa'
    const rules = [{ type: 'logic', operation: 'and', value: '8589934593', permissionId: `0x${'00'.repeat(32)}` }]

    it('sends the whole batch over the queue and returns what came back', async () => {
      const sendMessageStub = sandbox
        .stub(RabbitMQHelper, 'sendMessage')
        .resolves({ rulesByCondition: { [conditionAddress.toLowerCase()]: rules } })

      const result = await PermissionController.resolveSppRules([conditionAddress], network)

      expect(result).to.deep.equal({ [conditionAddress.toLowerCase()]: rules })

      const [queueName, payload, opts] = sendMessageStub.firstCall.args
      expect(queueName).to.equal(EnumQueueName.sppRuleCondition)
      expect(payload.params.conditionAddresses).to.deep.equal([conditionAddress])
      expect(payload.params.network).to.equal(network)
      expect(opts).to.include({ waitResponse: true })
    })

    it('returns null when the dao service never replies, so permissions stay unknown', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

      expect(await PermissionController.resolveSppRules([conditionAddress], network)).to.be.null
    })

    it('returns null when the reply carries no rules map', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({})

      expect(await PermissionController.resolveSppRules([conditionAddress], network)).to.be.null
    })
  })
})
