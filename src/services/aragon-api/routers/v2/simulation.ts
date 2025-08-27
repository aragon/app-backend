import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import SimulationSchema from '@api/routers/schema/simulation'
import SimulationController from '@api/controllers/simulation'

const SimulationRouter = {
  simulateBundle: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: (ctx.request.body as any).actions,
        network: (ctx.request.body as any).network,
      },
      schemas: {
        params: SimulationSchema.simulateBundle,
      },
    })

    ctx.body = await SimulationController.simulateBundle(result.params.actions, result.params.network)
  },
  
  // For backward compatibility
  runSimulationBundle: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        simulations: (ctx.request.body as any).simulations,
      },
      schemas: {
        params: SimulationSchema.simulationBundle,
      },
    })

    // Convert simulation items to our new action format
    const actions = result.params.simulations.map((sim: any) => ({
      to: sim.to,
      data: sim.input,
      value: sim.value,
      from: sim.from,
    }))
    
    // Extract network from first simulation item
    const network = result.params.simulations[0]?.network_id
    
    ctx.body = await SimulationController.simulateBundle(actions, network)
  },
  getSimulationByProposalId: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        proposalId: ctx.params.proposalId,
      },
      schemas: {
        params: SimulationSchema.getSimulationByProposalId,
      },
    })

    ctx.body = await SimulationController.getLastSimulation({ proposalId: result.params.proposalId })
  },
  
  getSimulationById: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        simulationId: ctx.params.simulationId,
      },
      schemas: {
        params: SimulationSchema.getSimulationById,
      },
    })

    ctx.body = await SimulationController.getLastSimulation({ simulationId: result.params.simulationId })
  },
  
  getSimulationByActions: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: (ctx.request.body as any).actions,
      },
      schemas: {
        params: SimulationSchema.getSimulationByActions,
      },
    })

    ctx.body = await SimulationController.getLastSimulation({ actions: result.params.actions })
  },

  runSimulationByProposalId: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        proposalId: ctx.params.proposalId,
      },
      schemas: {
        params: SimulationSchema.runSimulationByProposalId,
      },
    })

    ctx.body = await SimulationController.runNewSimulation(result.params.proposalId)
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} /simulations/:proposalId Get Last Simulation by Proposal ID
     * @apiName GetSimulationByProposalId
     * @apiGroup Simulations
     * @apiDescription Get the last simulation for a given proposal
     *
     * @apiParam {String} proposalId The proposal ID
     *
     * @apiSuccess (200) {String} status Simulation status (success|failed|running)
     * @apiSuccess (200) {String} [url] Shareable simulation URL
     * @apiSuccess (200) {String} runAt Simulation timestamp
     * @apiSuccess (200) {String} [errorMessage] Error message if failed
     *
     * @apiError (404) NotFound No simulation found for this proposal
     * @apiError (500) InternalServerError Server error occurred
     */
    router.get('/proposal/:proposalId', SimulationRouter.getSimulationByProposalId)

    /**
     * @api {get} /simulations/id/:simulationId Get Simulation by ID
     * @apiName GetSimulationById
     * @apiGroup Simulations
     * @apiDescription Get a simulation by its ID
     *
     * @apiParam {String} simulationId The simulation ID
     *
     * @apiSuccess (200) {String} status Simulation status (success|failed|running)
     * @apiSuccess (200) {String} [url] Shareable simulation URL
     * @apiSuccess (200) {String} runAt Simulation timestamp
     * @apiSuccess (200) {String} [errorMessage] Error message if failed
     *
     * @apiError (404) NotFound No simulation found with this ID
     * @apiError (500) InternalServerError Server error occurred
     */
    router.get('/id/:simulationId', SimulationRouter.getSimulationById)
    
    /**
     * @api {post} /simulations/by-actions Get Simulation by Actions
     * @apiName GetSimulationByActions
     * @apiGroup Simulations
     * @apiDescription Get a simulation by its actions
     *
     * @apiBody {Object[]} actions Array of action objects
     * @apiBody {String} actions.to Target contract address
     * @apiBody {String} [actions.data="0x"] Transaction input data
     * @apiBody {String} [actions.value="0"] Transaction value
     *
     * @apiSuccess (200) {String} status Simulation status (success|failed|running)
     * @apiSuccess (200) {String} [url] Shareable simulation URL
     * @apiSuccess (200) {String} runAt Simulation timestamp
     * @apiSuccess (200) {String} [errorMessage] Error message if failed
     *
     * @apiError (404) NotFound No simulation found for these actions
     * @apiError (500) InternalServerError Server error occurred
     */
    router.post('/by-actions', SimulationRouter.getSimulationByActions)

    /**
     * @api {post} /simulations/proposal/:proposalId Run New Simulation
     * @apiName RunSimulationByProposalId
     * @apiGroup Simulations
     * @apiDescription Run a new simulation for a given proposal
     *
     * @apiParam {String} proposalId The proposal ID
     *
     * @apiSuccess (200) {String} status Simulation status (success|failed|running)
     * @apiSuccess (200) {String} [url] Shareable simulation URL
     * @apiSuccess (200) {String} runAt Simulation timestamp
     * @apiSuccess (200) {String} [errorMessage] Error message if failed
     *
     * @apiError (503) ServiceUnavailable Tenderly service not available
     * @apiError (500) InternalServerError Server error occurred
     */
    router.post('/proposal/:proposalId', SimulationRouter.runSimulationByProposalId)

    /**
     * @api {post} /simulations/simulate Run Simulation for Actions
     * @apiName SimulateBundle
     * @apiGroup Simulations
     * @apiDescription Run a simulation for a bundle of actions
     *
     * @apiBody {Object[]} actions Array of action objects
     * @apiBody {String} [actions.from] Sender address (must be a valid plugin)
     * @apiBody {String} actions.to Target contract address (must be a valid DAO)
     * @apiBody {String} [actions.data="0x"] Transaction input data
     * @apiBody {String} [actions.value="0"] Transaction value
     * @apiBody {String} [network] Network to run the simulation on
     *
     * @apiSuccess (200) {String} status Simulation status (success|failed|running)
     * @apiSuccess (200) {String} [url] Shareable simulation URL
     * @apiSuccess (200) {String} runAt Simulation timestamp
     * @apiSuccess (200) {String} [errorMessage] Error message if failed
     *
     * @apiError (503) ServiceUnavailable Tenderly service not available
     * @apiError (500) InternalServerError Server error occurred
     */
    router.post('/simulate', SimulationRouter.simulateBundle)

    /**
     * @api {post} /simulations/bundle Run Simulation Bundle (Legacy)
     * @apiName RunSimulationBundle
     * @apiGroup Simulations
     * @apiDescription Run a bundle of simulations using Tenderly's simulate-bundle API (Legacy endpoint)
     *
     * @apiBody {Object[]} simulations Array of simulation objects
     * @apiBody {String} simulations.network_id Network ID for the simulation (e.g., "1" for Ethereum mainnet)
     * @apiBody {Boolean} [simulations.save=true] Whether to save the simulation
     * @apiBody {Boolean} [simulations.save_if_fails=true] Whether to save the simulation if it fails
     * @apiBody {String} [simulations.simulation_type="full"] Simulation type
     * @apiBody {String} [simulations.from] Sender address
     * @apiBody {String} simulations.to Target contract address
     * @apiBody {String} [simulations.input] Transaction input data
     * @apiBody {String} [simulations.value] Transaction value
     * @apiBody {Number} [simulations.gas] Gas limit
     * @apiBody {String} [simulations.gas_price] Gas price
     * @apiBody {Object} [simulations.state_objects] State objects to modify before simulation
     *
     * @apiSuccess (200) {String} status Simulation status (success|failed|running)
     * @apiSuccess (200) {String} [url] Shareable simulation URL
     * @apiSuccess (200) {String} runAt Simulation timestamp
     * @apiSuccess (200) {String} [errorMessage] Error message if failed
     *
     * @apiError (503) ServiceUnavailable Tenderly service not available
     * @apiError (500) InternalServerError Server error occurred
     */
    router.post('/bundle', SimulationRouter.runSimulationBundle)

    // For backward compatibility
    router.get('/:proposalId', SimulationRouter.getSimulationByProposalId)
    router.post('/:proposalId', SimulationRouter.runSimulationByProposalId)
    
    return router
  },
}

export default SimulationRouter
