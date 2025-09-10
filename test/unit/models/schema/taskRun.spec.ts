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

  it('Should create TaskRun with existing id', async () => {
    const customId = 'custom-id-12345'
    const taskRunWithId = {
      ...rawTaskRun,
      id: customId,
    }
    const createdTaskRun = await Models.TaskRun.create(taskRunWithId)
    expect(createdTaskRun.id).to.eq(customId)
  })

  it('Should not update when value is equal', async () => {
    const createdTaskRun = await Models.TaskRun.create(rawTaskRun)
    const saveSpy = sandbox.spy(createdTaskRun, 'save')

    // Update with the same value
    await createdTaskRun.update({
      serviceName: rawTaskRun.serviceName,
    })

    // Save should still be called but the value should remain the same
    expect(saveSpy.calledOnce).to.be.true
    expect(createdTaskRun.serviceName).to.eq(rawTaskRun.serviceName)
  })

  it('Should getRecentRuns', async () => {
    const serviceName = 'test-service'
    // Create multiple task runs
    await Models.TaskRun.create({
      ...rawTaskRun,
      serviceName,
    })
    await Models.TaskRun.create({
      ...rawTaskRun,
      serviceName,
      startAt: dayjs.utc().add(1, 'hour').toDate(),
    })
    await Models.TaskRun.create({
      ...rawTaskRun,
      serviceName: 'other-service', // Different service
    })

    const recentRuns = await Models.TaskRun.getRecentRuns(serviceName, 5, 0)

    expect(recentRuns).to.have.lengthOf(2)
    expect(recentRuns[0].serviceName).to.eq(serviceName)
    expect(recentRuns[1].serviceName).to.eq(serviceName)
    // Check that tasks.params is excluded
    expect(recentRuns[0].tasks).to.exist
    if (recentRuns[0].tasks[0]) {
      expect(recentRuns[0].tasks[0].params).to.be.undefined
    }
  })

  it('Should getRecentRuns with limit and skip', async () => {
    const serviceName = 'pagination-test'
    // Create 3 task runs
    for (let i = 0; i < 3; i++) {
      await Models.TaskRun.create({
        ...rawTaskRun,
        serviceName,
        startAt: dayjs.utc().add(i, 'minute').toDate(),
      })
    }

    const firstPage = await Models.TaskRun.getRecentRuns(serviceName, 2, 0)
    const secondPage = await Models.TaskRun.getRecentRuns(serviceName, 2, 2)

    expect(firstPage).to.have.lengthOf(2)
    expect(secondPage).to.have.lengthOf(1)
  })

  it('Should getTaskStatistics', async () => {
    const serviceName = 'stats-test'
    const now = dayjs.utc()

    // Create a task run with different task statuses
    await Models.TaskRun.create({
      serviceName,
      startAt: now.toDate(),
      endAt: now.add(1, 'hour').toDate(),
      tasks: [
        {
          taskName: 'task1',
          startAt: now.toDate(),
          endAt: now.add(30, 'minutes').toDate(),
          position: 1,
          status: IEnumTaskStatus.DONE,
        },
        {
          taskName: 'task1',
          startAt: now.toDate(),
          endAt: now.add(45, 'minutes').toDate(),
          position: 2,
          status: IEnumTaskStatus.DONE,
        },
        {
          taskName: 'task2',
          startAt: now.toDate(),
          endAt: now.add(15, 'minutes').toDate(),
          position: 3,
          status: IEnumTaskStatus.ERROR,
        },
      ],
    })

    const statistics = await Models.TaskRun.getTaskStatistics(serviceName, 7)

    expect(statistics).to.have.lengthOf(2) // 2 different task-status combinations

    const task1Stats = statistics.find(
      stat => stat._id.taskName === 'task1' && stat._id.status === IEnumTaskStatus.DONE,
    )
    const task2Stats = statistics.find(
      stat => stat._id.taskName === 'task2' && stat._id.status === IEnumTaskStatus.ERROR,
    )

    expect(task1Stats).to.exist
    expect(task1Stats?.count).to.eq(2)
    expect(task1Stats?.avgDuration).to.exist

    expect(task2Stats).to.exist
    expect(task2Stats?.count).to.eq(1)
    expect(task2Stats?.avgDuration).to.exist
  })

  it('Should getTaskStatistics with custom days', async () => {
    const serviceName = 'stats-days-test'
    const oldDate = dayjs.utc().subtract(10, 'days')
    const recentDate = dayjs.utc().subtract(2, 'days')

    // Create old task run (should be excluded)
    await Models.TaskRun.create({
      serviceName,
      startAt: oldDate.toDate(),
      tasks: [
        {
          taskName: 'oldTask',
          startAt: oldDate.toDate(),
          endAt: oldDate.add(30, 'minutes').toDate(),
          position: 1,
          status: IEnumTaskStatus.DONE,
        },
      ],
      createdAt: oldDate.toDate(),
    })

    // Create recent task run (should be included)
    await Models.TaskRun.create({
      serviceName,
      startAt: recentDate.toDate(),
      tasks: [
        {
          taskName: 'recentTask',
          startAt: recentDate.toDate(),
          endAt: recentDate.add(30, 'minutes').toDate(),
          position: 1,
          status: IEnumTaskStatus.DONE,
        },
      ],
      createdAt: recentDate.toDate(),
    })

    const statistics = await Models.TaskRun.getTaskStatistics(serviceName, 5)

    expect(statistics).to.have.lengthOf(1)
    expect(statistics[0]._id.taskName).to.eq('recentTask')
  })

  it('Should return empty array when no tasks found for statistics', async () => {
    const nonExistentService = 'non-existent-service'
    const statistics = await Models.TaskRun.getTaskStatistics(nonExistentService, 7)

    expect(statistics).to.be.an('array').that.is.empty
  })
})
