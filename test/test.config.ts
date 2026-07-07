import './environment'
import utils from '@helpers/utils'
import logger from '@logger'
import MongoDB from '@modules/mongo'
import ProviderModule from '@modules/provider'
import { MockDB } from '@test/lib/mockDb'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { glob } from 'glob'
import Mocha from 'mocha'
import * as path from 'path'
import { argv } from 'process'

logger.transports[0].level = 'silly'
chai.use(chaiAsPromised)
declare const global: any
global.chai = chai
global.expect = chai.expect

let testFolder = ''
if (argv.includes('--unit-dep')) {
  testFolder = 'unit-dep'
} else if (argv.includes('--unit')) {
  testFolder = 'unit'
} else if (argv.includes('--manual')) {
  testFolder = 'manual'
} else if (argv.includes('--integration')) {
  testFolder = 'integration'
} else {
  console.error('Please type the correct params')
  process.exit(1)
}

async function runTests() {
  const mocha = new Mocha({
    ui: 'bdd',
    timeout: testFolder === 'integration' ? 300_000 : 60000,
    color: true,
    diff: true,
    fullTrace: true,
  })

  // MockDB setup
  console.log('Using MockDB...') // eslint-disable-line no-console
  mocha.suite.beforeAll(async () => {
    switch (testFolder) {
      case 'unit':
        await MockDB.connect()
        await utils.wait(500)
        break
      case 'unit-dep':
        await MongoDB.connect()
        await ProviderModule.connectToAllNetworks()
        break
      case 'integration':
        await MongoDB.connect()
        break
      default:
        break
    }
  })

  mocha.suite.beforeEach(async () => {
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

  mocha.suite.afterAll(async () => {
    switch (testFolder) {
      case 'unit-dep':
        await ProviderModule.closeAllNetworks()
        break
      default:
        break
    }
  })

  // Resolve and add test files
  const pattern = path.join(__dirname, testFolder, '**', '*.ts')

  try {
    // Sorted for determinism so CI shards always agree on the partition.
    const files = (await glob(pattern)).sort()

    // Optional CI sharding: TEST_SHARD="<index>/<total>" (e.g. "2/3") runs the index-th
    // round-robin partition of the sorted spec-file list. Unset = run everything.
    const shard = process.env.TEST_SHARD
    let selected = files
    if (shard) {
      const match = shard.match(/^(\d+)\/(\d+)$/)
      const index = match ? Number(match[1]) : 0
      const total = match ? Number(match[2]) : 0
      if (!match || index < 1 || index > total) {
        console.error(`Invalid TEST_SHARD "${shard}" — expected "<index>/<total>", e.g. "1/3"`)
        process.exit(1)
      }
      selected = files.filter((_, i) => i % total === index - 1)
      console.log(`TEST_SHARD ${shard}: running ${selected.length}/${files.length} spec files`) // eslint-disable-line no-console
    }

    selected.forEach(file => mocha.addFile(file))

    mocha.run(failures => {
      process.exitCode = failures ? 1 : 0
      if (failures) {
        console.error(failures)
        process.exit(1)
      } else {
        console.log('All tests passed!')
        process.exit(0)
      }
    })
  } catch (err) {
    console.error('Could not find test files', err)
    process.exit(1)
  }
}

runTests().catch(error => {
  console.error('Unhandled Rejection at: Promise', error)
  process.exit(1)
})
