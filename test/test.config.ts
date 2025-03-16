import './environment'
import * as path from 'path'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { glob } from 'glob'
import { argv } from 'process'
import Mocha from 'mocha'
import { MockDB } from '@test/lib/mockDb'
import logger from '@logger'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import MongoDB from '@modules/mongo'

// Configure logger - use minimal logging during tests
logger.transports[0].level = 'error' // Only log errors during test runs

// Setup chai
chai.use(chaiAsPromised)
declare const global: any
global.chai = chai
global.expect = chai.expect

// Determine test folder based on CLI arguments
let testFolder = ''
if (argv.includes('--unit-dep')) {
  testFolder = 'unit-dep'
} else if (argv.includes('--unit')) {
  testFolder = 'unit'
} else if (argv.includes('--manual')) {
  testFolder = 'manual'
} else {
  console.error('Please provide a valid test type: --unit, --unit-dep, or --manual')
  process.exit(1)
}

// Parse additional CLI flags
const isParallel = argv.includes('--parallel')
const grep = argv.find(arg => arg.startsWith('--grep='))?.split('=')[1]
const bail = argv.includes('--bail')
const fgrep = argv.find(arg => arg.startsWith('--fgrep='))?.split('=')[1]

async function runTests() {
  console.time('Total test execution time')

  // Create Mocha instance with optimized configuration
  const mocha = new Mocha({
    ui: 'bdd',
    timeout: 10000, // Reduced timeout for faster feedback
    color: true,
    diff: true,
    fullTrace: false, // Disable full trace for faster error reporting
    bail: bail, // Exit on first test failure if --bail is passed
    grep: grep ? new RegExp(grep) : undefined,
    fgrep: fgrep,
    parallel: isParallel, // Run tests in parallel if --parallel is passed
    jobs: isParallel ? 4 : undefined, // Number of parallel jobs
  })

  // Global setup before all tests
  mocha.suite.beforeAll(async function () {
    this.timeout(30000) // Allow longer timeout for initial setup

    console.log(`Running ${testFolder} tests...`)

    switch (testFolder) {
      case 'unit':
        await MockDB.connect()
        await utils.wait(100) // Reduced wait time
        break
      case 'unit-dep':
        await MongoDB.connect()
        await ProviderModule.connectToAllNetworks()
        break
      default:
        break
    }
  })

  // Before each test
  mocha.suite.beforeEach(async function () {
    switch (testFolder) {
      case 'unit':
        await MockDB.drop()
        break
      case 'unit-dep':
        await MongoDB.drop()
        break
      default:
        break
    }
  })

  // After all tests
  mocha.suite.afterAll(async function () {
    this.timeout(10000) // Allow time for cleanup

    switch (testFolder) {
      case 'unit-dep':
        await ProviderModule.closeAllNetworks()
        break
      default:
        break
    }
  })

  // Find test files using optimized glob pattern
  try {
    const pattern = path.join(__dirname, testFolder, '**', '*.ts')
    console.time('Test file discovery')
    const files = await glob(pattern, { follow: false }) // Don't follow symlinks for faster discovery
    console.timeEnd('Test file discovery')

    if (files.length === 0) {
      console.warn(`No test files found in ${testFolder} directory!`)
      process.exit(0)
    }

    console.log(`Found ${files.length} test files to run`)

    // Add files to Mocha
    files.forEach(file => mocha.addFile(file))

    // Run the tests
    mocha.run(failures => {
      console.timeEnd('Total test execution time')

      process.exitCode = failures ? 1 : 0
      if (failures) {
        console.error(`${failures} test(s) failed`)
        process.exit(1)
      } else {
        console.log('All tests passed')
        process.exit(0)
      }
    })
  } catch (err) {
    console.error('Error running tests:', err)
    process.exit(1)
  }
}

// Run tests and handle any unhandled rejections
runTests().catch(error => {
  console.error('Unhandled rejection:', error)
  process.exit(1)
})
