// @ts-nocheck

import mongoose from 'mongoose'
import * as sinon from 'sinon'

const MethodTypes = Object.freeze({
  aggregate: 'aggregate',
  populate: 'populate',
  query: 'query',
})

function getMethodType(method: string) {
  const methodType = MethodTypes[method]
  return methodType || MethodTypes.query
}

function chainMethod(type: string, object: any) {
  let mockType: string
  switch (type) {
    case MethodTypes.aggregate:
      mockType = new mongoose.Aggregate()
      break

    case MethodTypes.populate:
      mockType = object
      break

    default:
      mockType = new mongoose.Query()
      break
  }

  return function chain(method: string) {
    const queryMock = sinon.mock(mockType)
    this.owner.chainedMock = queryMock
    makeChainable(queryMock, object, type)
    makeChainableVerify(queryMock)
    this.returns(queryMock.object)

    return queryMock.expects(method)
  }
}

function makeChainable(mock: any, object: any, mockType: string) {
  const expectsMethod = mock.expects

  mock.expects = function (method: string) {
    mockType = mockType || getMethodType(method)
    const expectation = expectsMethod.apply(mock, arguments)
    expectation.owner = mock
    expectation.chain = chainMethod(mockType, object).bind(expectation)
    return expectation
  }
}

function makeChainableVerify(mockResult: any) {
  const originalVerify = mockResult.verify
  function chainedVerify() {
    originalVerify.call(mockResult)
    if (mockResult.chainedMock) {
      mockResult.chainedMock.verify()
    }
  }
  mockResult.verify = chainedVerify
}

const oldMock: any = (sinon.mock(sinon as any).mock = function mock(object: any) {
  const mockResult = oldMock.apply(this, arguments)

  if (object && (object instanceof mongoose.Model || object.schema instanceof mongoose.Schema)) {
    makeChainable(mockResult, object)
    makeChainableVerify(mockResult)
  }
  return mockResult
})

function sandboxMock(object: any) {
  const mockResult = oldMock.apply(null, arguments)

  if (object && (object instanceof mongoose.Model || object.schema instanceof mongoose.Schema)) {
    makeChainable(mockResult, object)
    makeChainableVerify(mockResult)
  }

  return this.add(mockResult)
}

if (sinon.sandbox) {
  sinon.sandbox.mock = sandboxMock
}
