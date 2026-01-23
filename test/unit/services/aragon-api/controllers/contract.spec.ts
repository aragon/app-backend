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

  describe('decodeContractDataBatch', () => {
    it('should return decoded batch data when RabbitMQ returns a response', async () => {
      const mockResponse = [{ type: 'TransferNative' }, { type: 'Transfer' }] as any
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockResponse)

      const params = {
        from: '0xDAO' as any,
        actions: [
          { to: '0xRecipient1', data: '0x12345678', value: '0' },
          { to: '0xRecipient2', data: '0x87654321', value: '0' },
        ],
        network: NetworksEnum.ethereumMainnet,
      }

      const result = await ContractController.decodeContractDataBatch(params)

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.firstCall.args[0]).to.equal(EnumQueueName.contractDecoderLight)
      expect(rabbitMqStub.firstCall.args[1].params).to.deep.equal(params)
      expect(result).to.deep.equal(mockResponse)
    })

    it('should generate correct message id from actions', async () => {
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves([])

      const params = {
        from: '0xDAO' as any,
        actions: [
          { to: '0xContract1', data: '0x12345678aabbccdd', value: '0' },
          { to: '0xContract2', data: '0x87654321eeffgghh', value: '0' },
        ],
        network: NetworksEnum.ethereumMainnet,
      }

      await ContractController.decodeContractDataBatch(params)

      const messageId = rabbitMqStub.firstCall.args[1].id
      expect(messageId).to.include('contractDecoderLight-ethereum-mainnet')
      expect(messageId).to.include('0xContract1-0x12345678')
      expect(messageId).to.include('0xContract2-0x87654321')
    })

    it('should return an error response if RabbitMQ throws an exception', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ Error'))

      const params = {
        from: '0xDAO' as any,
        actions: [{ to: '0xRecipient', data: '0x', value: '0' }],
        network: NetworksEnum.ethereumMainnet,
      }

      const result = await ContractController.decodeContractDataBatch(params)

      expect(result).to.deep.equal({ error: true })
    })
  })
})
