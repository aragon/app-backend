import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { IEventLogMember, NetworksEnum } from '@types'
import LogMember from '@models/schema/logMember'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'

describe('Model: LogMember', () => {
  let sandbox: SinonSandbox
  let rawLogMember: Partial<LogMember>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLogMember = {
      event: IEventLogMember.MembersAdded,
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.ethereumMainnet,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      pluginAddress: '0x123',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogMember', async () => {
    it('Should create LogMember', async () => {
      const entityId = Models.LogMember.getEntityId({
        transactionHash: rawLogMember.transactionHash,
        event: rawLogMember.event,
        address: rawLogMember.address,
        network: rawLogMember.network,
        pluginAddress: rawLogMember.pluginAddress,
      } as any)
      const member = await Models.LogMember.create(rawLogMember)
      expect(member.id).to.eq(entityId)
    })
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const eventName = IEventLogMember.MembersAdded
    const entityId = Models.LogMember.getEntityId({
      transactionHash,
      event: eventName,
      address: rawLogMember.address,
      network: rawLogMember.network,
      pluginAddress: rawLogMember.pluginAddress,
    } as any)
    expect(entityId).to.eq(
      `${rawLogMember.network}-${rawLogMember.transactionHash}-${eventName}-${rawLogMember.pluginAddress}-${rawLogMember.address}`,
    )
  })

  it('Should findExistingLog', async () => {
    const createdMember = await Models.LogMember.create(rawLogMember)
    const foundLogMember = await Models.LogMember.findExistingLog({
      transactionHash: rawLogMember.transactionHash,
      event: rawLogMember.event,
      address: rawLogMember.address,
      network: rawLogMember.network,
      pluginAddress: rawLogMember.pluginAddress,
    } as any)
    expect(foundLogMember?.id).to.eq(createdMember.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Member.create(rawLogMember)
    const foundLogDao = await Models.Member.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('should update LogMember', async () => {
    const member = await Models.LogMember.create(rawLogMember)
    const updatedMember = await member.update({ event: IEventLogMember.MembersRemoved })
    expect(updatedMember.event).to.eq(IEventLogMember.MembersRemoved)
  })

  it('should reload LogMember', async () => {
    const createdMember = await Models.LogMember.create(rawLogMember)
    const foundLogMember = await createdMember.reload()
    expect(foundLogMember?.id).to.eq(createdMember.id)
  })
})
