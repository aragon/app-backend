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

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawLogMember = {
      event: IEventLogMember.MembersAdded,
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      address,
      pluginAddress: '0x123',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogMember', async () => {
    it('Should create LogMember', async () => {
      const member = await Models.LogMember.create(rawLogMember)
      expect(member.entityId).to.exist
    })

    it('should update LogMember', async () => {
      const member = await Models.LogMember.create(rawLogMember)
      const updatedMember = await member.update({ event: IEventLogMember.MembersRemoved })
      expect(updatedMember.event).to.eq(IEventLogMember.MembersRemoved)
    })

    it('Should getEntityId', async () => {
      const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
      const eventName = IEventLogMember.MembersAdded
      const entityId = await Models.LogMember.getEntityId(transactionHash, eventName)
      expect(entityId).to.eq(`${transactionHash}-${eventName}`)
    })

    it('Should findExistingLog', async () => {
      const createdMember = await Models.LogMember.create(rawLogMember)
      const foundLogMember = await Models.LogMember.findExistingLog(createdMember.transactionHash, createdMember.event)
      expect(foundLogMember?.entityId).to.eq(createdMember.entityId)
    })

    it('should reload LogMember', async () => {
      const createdMember = await Models.LogMember.create(rawLogMember)
      const foundLogMember = await createdMember.reload()
      expect(foundLogMember?.entityId).to.eq(createdMember.entityId)
    })
  })
})
