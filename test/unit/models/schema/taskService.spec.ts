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

  describe('Lock management fields', () => {
    it('Should create TaskService with lock fields', async () => {
      const lockExpiresAt = dayjs.utc().add(5, 'minutes').toDate()
      const lockedAt = dayjs.utc().toDate()
      const taskWithLock = {
        ...rawTaskService,
        lockedUntil: lockExpiresAt,
        lockedBy: 12345,
        lockedAt: lockedAt,
        hostname: 'test-host',
        instanceId: 'test-host-12345',
      }

      const created = await Models.TaskService.create(taskWithLock)

      expect(created.serviceName).to.eq(taskWithLock.serviceName)
      expect(created.lockedUntil).to.deep.eq(lockExpiresAt)
      expect(created.lockedBy).to.eq(12345)
      expect(created.lockedAt).to.deep.eq(lockedAt)
      expect(created.hostname).to.eq('test-host')
      expect(created.instanceId).to.eq('test-host-12345')
    })

    it('Should create TaskService without lock fields (unlocked state)', async () => {
      const created = await Models.TaskService.create(rawTaskService)

      expect(created.serviceName).to.eq(rawTaskService.serviceName)
      expect(created.lockedUntil).to.be.undefined
      expect(created.lockedBy).to.be.undefined
      expect(created.lockedAt).to.be.undefined
      expect(created.hostname).to.be.undefined
      expect(created.instanceId).to.be.undefined
    })

    it('Should update lock fields to acquire lock', async () => {
      const created = await Models.TaskService.create(rawTaskService)
      expect(created.lockedUntil).to.be.undefined

      const lockExpiresAt = dayjs.utc().add(5, 'minutes').toDate()
      const lockedAt = dayjs.utc().toDate()

      await created.update({
        lockedUntil: lockExpiresAt,
        lockedBy: 54321,
        lockedAt: lockedAt,
        hostname: 'worker-node-1',
        instanceId: 'worker-node-1-54321',
      })

      expect(created.lockedUntil).to.deep.eq(lockExpiresAt)
      expect(created.lockedBy).to.eq(54321)
      expect(created.lockedAt).to.deep.eq(lockedAt)
      expect(created.hostname).to.eq('worker-node-1')
      expect(created.instanceId).to.eq('worker-node-1-54321')
    })

    it('Should clear lock fields to release lock', async () => {
      const lockExpiresAt = dayjs.utc().add(5, 'minutes').toDate()
      const taskWithLock = {
        ...rawTaskService,
        lockedUntil: lockExpiresAt,
        lockedBy: 99999,
        lockedAt: dayjs.utc().toDate(),
        hostname: 'locked-host',
        instanceId: 'locked-host-99999',
      }

      const created = await Models.TaskService.create(taskWithLock)
      expect(created.lockedUntil).to.deep.eq(lockExpiresAt)

      // Simulate releasing the lock by unsetting fields
      await created.update({
        lockedUntil: undefined,
        lockedBy: undefined,
        lockedAt: undefined,
        hostname: undefined,
        instanceId: undefined,
      })

      expect(created.lockedUntil).to.be.undefined
      expect(created.lockedBy).to.be.undefined
      expect(created.lockedAt).to.be.undefined
      expect(created.hostname).to.be.undefined
      expect(created.instanceId).to.be.undefined
    })

    it('Should handle expired locks correctly', async () => {
      const expiredLockTime = dayjs.utc().subtract(10, 'minutes').toDate()
      const taskWithExpiredLock = {
        ...rawTaskService,
        lockedUntil: expiredLockTime,
        lockedBy: 11111,
        lockedAt: dayjs.utc().subtract(15, 'minutes').toDate(),
        hostname: 'old-host',
        instanceId: 'old-host-11111',
      }

      const created = await Models.TaskService.create(taskWithExpiredLock)

      // Verify the expired lock was stored
      expect(created.lockedUntil).to.deep.eq(expiredLockTime)
      expect(created.lockedBy).to.eq(11111)

      // Check if lock is expired
      const now = dayjs.utc()
      const isExpired = now.isAfter(created.lockedUntil)
      expect(isExpired).to.be.true
    })

    it('Should update only changed lock fields', async () => {
      const created = await Models.TaskService.create({
        ...rawTaskService,
        lockedBy: 33333,
        hostname: 'initial-host',
      })

      expect(created.lockedBy).to.eq(33333)
      expect(created.hostname).to.eq('initial-host')

      // Update only lockedUntil, other fields should remain
      const newLockTime = dayjs.utc().add(10, 'minutes').toDate()
      await created.update({
        lockedUntil: newLockTime,
      })

      expect(created.lockedUntil).to.deep.eq(newLockTime)
      expect(created.lockedBy).to.eq(33333) // Should remain unchanged
      expect(created.hostname).to.eq('initial-host') // Should remain unchanged
    })

    it('Should handle concurrent lock attempts (simulated)', async () => {
      const created = await Models.TaskService.create(rawTaskService)

      // First process acquires lock
      const lock1Time = dayjs.utc().add(5, 'minutes').toDate()
      await created.update({
        lockedUntil: lock1Time,
        lockedBy: 1001,
        instanceId: 'process-1001',
      })

      // Simulate second process trying to acquire (would fail in real scenario with findOneAndUpdate)
      // Here we just verify the lock is held by first process
      expect(created.lockedBy).to.eq(1001)
      expect(created.instanceId).to.eq('process-1001')

      // Lock should not be changed to second process values
      expect(created.lockedBy).to.not.eq(2002)
    })
  })
})
