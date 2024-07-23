import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import TaskService from '@models/schema/taskService'
import dayjs from '@helpers/dayjs'

describe('Model: TaskService', () => {
  let sandbox: SinonSandbox
  let rawTaskService: Partial<TaskService>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTaskService = {
      serviceName: 'indexer',
      interval: 3 * 60 * 60 * 1000,
      lastStartAt: dayjs.utc().add(3, 'hour').toDate(),
      nextStartAt: dayjs.utc().add(3, 'hour').toDate(),
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create TaskService', async () => {
    const createdConfigIndexer = await Models.TaskService.create(rawTaskService)

    expect(createdConfigIndexer.serviceName).to.eq(rawTaskService.serviceName)
    expect(createdConfigIndexer.interval).to.eq(rawTaskService.interval)
    expect(createdConfigIndexer.lastStartAt).to.eq(rawTaskService.lastStartAt)
    expect(createdConfigIndexer.nextStartAt).to.eq(rawTaskService.nextStartAt)
  })

  it('Should getEntityId', async () => {
    const entityId = Models.TaskService.getEntityId()
    expect(entityId).to.exist
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.TaskService.create(rawTaskService)
    const foundLogDao = await Models.TaskService.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should update TaskService', async () => {
    const createdConfigIndexer = await Models.TaskService.create(rawTaskService)
    expect(createdConfigIndexer.serviceName).to.eq(rawTaskService.serviceName)

    await createdConfigIndexer.update({
      serviceName: 'test',
    })

    expect(createdConfigIndexer.serviceName).to.eq('test')
  })

  it('Should reload', async () => {
    const createdConfigIndexer = await Models.TaskService.create(rawTaskService)
    await createdConfigIndexer.reload()

    expect(createdConfigIndexer.serviceName).to.eq(rawTaskService.serviceName)
  })
})
