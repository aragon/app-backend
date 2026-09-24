import { Models } from '@dbModels'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const OWNER = '0x1111111111111111111111111111111111111111' as HexAddress
const OTHER_OWNER = '0x2222222222222222222222222222222222222222' as HexAddress

describe('Model: SafeMember', () => {
  describe('findAndPaginate', () => {
    beforeEach(async () => {
      await Models.Member.create({ address: OWNER, ens: 'owner.eth' })
      await Models.Member.create({ address: OTHER_OWNER })
      await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
      await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OTHER_OWNER })
    })

    it('lists the owners of one Safe with their member info', async () => {
      const response = await Models.SafeMember.findAndPaginate({
        paginationParams: { pageSize: 10, page: 1, sort: 'createdAt', order: 'asc' },
        extraParams: { pluginAddress: SAFE, network: NETWORK },
      })

      expect(response.metadata.totalRecords).to.eq(2)
      expect(response.data.map(row => row.address)).to.deep.eq([OWNER, OTHER_OWNER])
      expect(response.data[0].ens).to.eq('owner.eth')
      expect(response.data[0].metrics).to.eq(null)
    })

    it('narrows by search text and pages past the end cleanly', async () => {
      const searched = await Models.SafeMember.findAndPaginate({
        paginationParams: { search: 'owner.eth' },
        extraParams: { pluginAddress: SAFE, network: NETWORK },
      })
      const beyond = await Models.SafeMember.findAndPaginate({
        paginationParams: { page: 3, pageSize: 10 },
        extraParams: { pluginAddress: SAFE, network: NETWORK },
      })

      expect(searched.data.map(row => row.address)).to.deep.eq([OWNER])
      expect(beyond.data).to.deep.eq([])
      expect(beyond.metadata.totalRecords).to.eq(0)
    })
  })
})
