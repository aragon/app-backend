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

logger.transports[0].level = 'silly'
chai.use(chaiAsPromised)
declare const global: any
global.chai = chai
global.expect = chai.expect

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise })
})

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', { error })
})

process.removeAllListeners('unhandledRejection')
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise })
})

let testFolder = ''
if (argv.includes('--unit-dep')) {
  testFolder = 'unit-dep'
} else if (argv.includes('--unit')) {
  testFolder = 'unit'
} else if (argv.includes('--manual')) {
  testFolder = 'manual'
} else {
  console.error('Please type the correct params')
  process.exit(1)
}

async function runTests() {
  const mocha = new Mocha({
    ui: 'bdd',
    timeout: 60000,
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
      case 'unit':
        break
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
    const files = await glob(pattern)
    files.map(file => mocha.addFile(file))

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
