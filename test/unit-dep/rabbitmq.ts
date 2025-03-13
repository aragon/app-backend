import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQModule from '@modules/rabbitMQ'
import Utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { EnumQueueName } from '@types'

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

    await RabbitMQHelper.process(EnumQueueName.voteInfo, async (data: any) => {
      msgCount++
      console.log('msgCount', msgCount)
      // await Utils.wait(1000 * 5)
      return data
    })

    const response = await RabbitMQHelper.sendMessage(
      EnumQueueName.voteInfo,
      {
        id: '123',
        params: {
          a: 1,
          b: 2,
        },
      },
      { waitResponse: true },
    )
    console.log('resp', response)
    console.log('resp', response)
    console.log('resp', response)
    console.log('resp', response)
    console.log('resp', response)
    console.log('resp', response)

    // for (let i = 0; i < 10; i++) {
    //   console.log('sending message')
    //   await RabbitMQHelper.sendMessage(EnumQueueName.voteInfo, {
    //     id: '123',
    //     params: {
    //       a: 1,
    //       b: 2,
    //     },
    //   })
    //   console.log('sent', i)
    // }

    await Utils.wait(100000)
  })
})
