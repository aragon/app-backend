import DispatchSimulationSchema from '@api/routers/schema/dispatchSimulation'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

const validate = (params: Record<string, any>) =>
  DispatchSimulationSchema.simulateDispatch.validate({
    policyAddress: '0x1111111111111111111111111111111111111111',
    network: NetworksEnum.ethereumMainnet,
    from: '0x2222222222222222222222222222222222222222',
    ...params,
  })

describe('Schema: dispatchSimulation', () => {
  it('accepts a request without data', () => {
    expect(validate({}).error).to.be.undefined
  })

  it('accepts hex data', () => {
    expect(validate({ data: '0xc6c4df0c' }).error).to.be.undefined
  })

  it('rejects data that is not hex', () => {
    expect(validate({ data: '0xcustomdata' }).error).to.not.be.undefined
    expect(validate({ data: 'c6c4df0c' }).error).to.not.be.undefined
    expect(validate({ data: '0xabc' }).error).to.not.be.undefined
  })
})
