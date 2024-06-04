import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'

import Member from '@models/schema/member'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'

describe('Model: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawMember = {
      address,
      daos: [
        {
          network: NetworksEnum.mainnet,
          pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
        },
      ],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Member', async () => {
    it('Should create Member', async () => {
      const member = await Models.Member.create(rawMember)
      expect(member.entityId).to.exist
    })

    it('should update Member', async () => {
      const member = await Models.Member.create(rawMember)
      const updatedMember = await member.update({ address: '0x00' })
      expect(updatedMember.address).to.eq('0x00')
    })

    it('Should getEntityId', async () => {
      const entityId = await Models.Member.getEntityId(rawMember.address)
      expect(entityId).to.eq(`${rawMember.address}`)
    })

    it('Should findExistingLog', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const foundMember = await Models.Member.findExistingLog(rawMember.address)
      expect(foundMember?.entityId).to.eq(createdMember.entityId)
    })

    it('should reload Member', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const foundMember = await createdMember.reload()
      expect(foundMember?.entityId).to.eq(createdMember.entityId)
    })
  })
})
