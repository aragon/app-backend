import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import RabbitMQModule from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RabbitMq Test', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('rabbitMq', async function () {
    await RabbitMQModule.connect()

    let msgCount = 0

    await RabbitMQHelper.process(EnumQueueName.daoTransactions, async (data: any) => {
      msgCount++
      console.log('msgCount', msgCount)
      await Utils.wait(1000 * 5)
      console.log('Finished')
    })

    for (let i = 0; i < 100; i++) {
      await RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
        id: '123' + i,
        params: {
          a: 1,
          b: 2,
        },
      })
    }

    await Utils.wait(100000)
  })
})
