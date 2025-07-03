import './integ-environment'
import * as path from 'path'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { glob } from 'glob'
import Mocha from 'mocha'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import MongoDB from '@modules/mongo'
import SeedDb from '@test/seed'
import RabbitMQ from '@modules/rabbitMQ'

logger.transports[0].level = 'silly'
chai.use(chaiAsPromised)
declare const global: any
global.chai = chai
global.expect = chai.expect

const testFolder = 'integration'

async function runTests() {
  const mocha = new Mocha({
    ui: 'bdd',
    timeout: 120000,
    color: true,
    diff: true,
    fullTrace: true,
  })

  // MockDB setup
  console.log('Using MockDB...') // eslint-disable-line no-console
  mocha.suite.beforeAll(async () => {
    await MongoDB.connect()
    await MongoDB.drop()
    await RabbitMQ.connect()
    await ProviderModule.connectToAllNetworks()
    await SeedDb.start()
  })

  mocha.suite.beforeEach(async () => {
    await MongoDB.drop()
  })

  mocha.suite.afterAll(async () => {
    await ProviderModule.closeAllNetworks()
  })

  // Resolve and add test files
  const pattern = path.join(__dirname, testFolder, '**', '*.ts')

  try {
    const files = await glob(pattern)
    files.forEach(file => mocha.addFile(file))

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
