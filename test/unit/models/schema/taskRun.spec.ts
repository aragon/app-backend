import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import TaskRun from '@models/schema/taskRun'
import dayjs from '@helpers/dayjs'
import { IEnumTaskStatus } from '@types'

describe('Model: TaskRun', () => {
  let sandbox: SinonSandbox
  let rawTaskRun: Partial<TaskRun>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTaskRun = {
      serviceName: 'indexer',
      startAt: dayjs.utc().toDate(),
      endAt: dayjs.utc().add(3, 'hour').toDate(),
      tasks: [
        {
          taskName: 'exampleTask',
          startAt: dayjs.utc().toDate(),
          position: 1,
          status: IEnumTaskStatus.PENDING,
        },
      ],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create TaskRun', async () => {
    const createdTaskRun = await Models.TaskRun.create(rawTaskRun)

    expect(createdTaskRun.serviceName).to.eq(rawTaskRun.serviceName)
    expect(createdTaskRun.startAt).to.eq(rawTaskRun.startAt)
    expect(createdTaskRun.endAt).to.eq(rawTaskRun.endAt)
    expect(createdTaskRun.tasks[0].taskName).to.eq(rawTaskRun.tasks?.[0].taskName)
  })

  it('Should getEntityId', async () => {
    const entityId = Models.TaskRun.getEntityId()
    expect(entityId).to.exist
  })

  it('Should findByEntityId', async () => {
    const createdTaskRun = await Models.TaskRun.create(rawTaskRun)
    const foundTaskRun = await Models.TaskRun.findByEntityId(createdTaskRun.id)
    expect(foundTaskRun?.id).to.eq(createdTaskRun.id)
  })

  it('Should update TaskRun', async () => {
    const createdTaskRun = await Models.TaskRun.create(rawTaskRun)
    expect(createdTaskRun.serviceName).to.eq(rawTaskRun.serviceName)

    await createdTaskRun.update({
      serviceName: 'test',
    })

    expect(createdTaskRun.serviceName).to.eq('test')
  })

  it('Should reload', async () => {
    const createdTaskRun = await Models.TaskRun.create(rawTaskRun)
    await createdTaskRun.reload()

    expect(createdTaskRun.serviceName).to.eq(rawTaskRun.serviceName)
  })
})
