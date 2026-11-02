import InFlight from '@modules/inFlight'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('Module: inFlight', () => {
  it('runs matching work once and gives every caller the same answer', async () => {
    const work = sinon.stub().callsFake(() => new Promise(resolve => setImmediate(() => resolve('answer'))))

    const answers = await Promise.all([InFlight.run('key', work), InFlight.run('key', work)])

    expect(answers).to.deep.equal(['answer', 'answer'])
    expect(work.calledOnce).to.be.true
  })

  it('runs different keys separately', async () => {
    const work = sinon.stub().resolves('answer')

    await Promise.all([InFlight.run('one', work), InFlight.run('two', work)])

    expect(work.calledTwice).to.be.true
  })

  it('runs again once the earlier work has finished', async () => {
    const work = sinon.stub().resolves('answer')

    await InFlight.run('key', work)
    await InFlight.run('key', work)

    expect(work.calledTwice).to.be.true
  })

  it('does not keep a failure for the next caller', async () => {
    const work = sinon.stub()
    work.onFirstCall().rejects(new Error('down'))
    work.onSecondCall().resolves('answer')

    const first: any = await InFlight.run('key', work).catch(error => error)
    const second = await InFlight.run('key', work)

    expect(first.message).to.equal('down')
    expect(second).to.equal('answer')
  })

  it('fails every joined caller when the shared work fails', async () => {
    const work = sinon.stub().callsFake(() => new Promise((_, reject) => setImmediate(() => reject(new Error('down')))))

    const answers: any[] = await Promise.all([
      InFlight.run('key', work).catch(error => error.message),
      InFlight.run('key', work).catch(error => error.message),
    ])

    expect(answers).to.deep.equal(['down', 'down'])
    expect(work.calledOnce).to.be.true
  })
})
