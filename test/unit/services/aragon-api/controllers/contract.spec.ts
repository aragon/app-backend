import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ContractController from '@services/aragon-api/controllers/contract'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Contract', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getContractDetails', () => {
    it('should return contract details when RabbitMQ returns a response', async () => {
      const mockResponse = { contractName: 'MyContract', address: '0x123' } as any
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockResponse)

      const result = await ContractController.getContractDetails({
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
      })

      expect(
        rabbitMqStub.calledOnceWith(
          EnumQueueName.contractInfo,
          {
            id: 'contractInfo-ethereum-mainnet-0x123',
            params: { network: NetworksEnum.ethereumMainnet, address: '0x123' },
          },
          { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
        ),
      ).to.be.true

      expect(result).to.deep.equal(mockResponse)
    })

    it('should return an error response if RabbitMQ throws an exception', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ Error'))

      const result = await ContractController.getContractDetails({
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
      })

      expect(result).to.deep.equal({ error: true })
    })
  })

  describe('decodeContractData', () => {
    it('should return decoded contract data when RabbitMQ returns a response', async () => {
      const mockResponse = { decodedData: 'decodedData' } as any
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockResponse)

      const result = await ContractController.decodeContractData({
        network: NetworksEnum.ethereumMainnet,
        from: '0xfrom',
        to: '0xto',
        data: '0xdata',
        value: '0xvalue',
      })

      expect(
        rabbitMqStub.calledOnceWith(
          EnumQueueName.contractDecoder,
          {
            id: 'contractDecoder-ethereum-mainnet-0xto-0xfrom-0xdata-0xvalue',
            params: {
              network: NetworksEnum.ethereumMainnet,
              from: '0xfrom',
              to: '0xto',
              data: '0xdata',
              value: '0xvalue',
            },
          },
          { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
        ),
      ).to.be.true

      expect(result).to.deep.equal(mockResponse)
    })

    it('should return an error response if RabbitMQ throws an exception', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ Error'))

      const result = await ContractController.decodeContractData({
        network: NetworksEnum.ethereumMainnet,
        from: '0xfrom',
        to: '0xto',
        data: '0xdata',
        value: '0xvalue',
      })

      expect(result).to.deep.equal({ error: true })
    })
  })
})
