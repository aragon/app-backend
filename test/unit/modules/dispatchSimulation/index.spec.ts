import DispatchSimulationService, {
  AddressMapper,
  createAddressMapper,
  processSimulation,
  simulateDispatchSummary,
} from '@modules/dispatchSimulation'
import { expect } from 'chai'

describe('Module: dispatchSimulation/index', () => {
  describe('exports', () => {
    it('should export AddressMapper class', () => {
      expect(AddressMapper).to.be.a('function')
    })

    it('should export createAddressMapper function', () => {
      expect(createAddressMapper).to.be.a('function')
    })

    it('should export processSimulation function', () => {
      expect(processSimulation).to.be.a('function')
    })

    it('should export simulateDispatchSummary function', () => {
      expect(simulateDispatchSummary).to.be.a('function')
    })

    it('should export default DispatchSimulationService', () => {
      expect(DispatchSimulationService).to.be.an('object')
      expect(DispatchSimulationService.simulateDispatchSummary).to.be.a('function')
    })
  })
})
