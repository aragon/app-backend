import utils from '@helpers/utils'
import RabbitMQ from '@modules/rabbitMQ'
import ReceiverRabbitMQ from '@test/unit-dep/rabbitmq/receiver'
import SenderRabbitMQ from '@test/unit-dep/rabbitmq/sender'
import { EnumQueueName } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe.skip('Integ: RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('Test RabbitMQ', async function () {
    this.timeout(10000000)
    await RabbitMQ.connect()

    const data = { id: 'testId', params: { test: 1 } }
    const queueName = EnumQueueName.tokenInfo
    const callback = sinon.spy(async (params: any) => {
      expect(params.id).to.equal(data.id)
    })

    // listen receive
    await ReceiverRabbitMQ.receiveMessage(queueName, callback)

    // Step 1: Single call should trigger callback once
    await SenderRabbitMQ.sendMessage(queueName, data)
    await utils.wait(100)
    expect(callback.callCount).to.equal(1)
    callback.resetHistory()

    // Step 2: Parallel calls should still trigger callback only once
    await Promise.all([
      SenderRabbitMQ.sendMessage(queueName, data),
      SenderRabbitMQ.sendMessage(queueName, data),
      SenderRabbitMQ.sendMessage(queueName, data),
    ])
    await utils.wait(100)
    expect(callback.callCount).to.equal(1) // Ensure deduplication works
    callback.resetHistory()

    // Step 3: Another single call should again trigger the callback once
    await SenderRabbitMQ.sendMessage(queueName, data)
    await utils.wait(100)
    expect(callback.callCount).to.equal(1)

    await RabbitMQ.close()
    console.log('end')
  })
})
