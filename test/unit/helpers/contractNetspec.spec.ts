import sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import * as ContractNetspecHelper from '@helpers/contractNetspec'

import {expect} from "chai";
describe('Modules:ContractNetspec', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it.only('should try parsing ', async () => {
    // Example usage
    const sampleSourceCode = `
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.0;

      /**
       * @title Sample Contract
       * @dev This is a sample contract to demonstrate NatSpec extraction
       */
      contract SampleContract {
          /**
           * @notice Adds two numbers
           * @param a The first number
           * @param b The second number
           * @return The sum of a and b
           */
          function add(uint256 a, uint256 b) public pure returns (uint256) {
              return a + b;
          }
      }
    `;

    const results = ContractNetspecHelper.parseNetspec(sampleSourceCode, 'SampleContract', [
      {
        "inputs": [
          {
            "internalType": "uint256",
            "name": "a",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "b",
            "type": "uint256"
          }
        ],
        "name": "add",
        "outputs": [
          {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
          }
        ],
        "stateMutability": "pure",
        "type": "function"
      }
    ])
    expect(!!results).to.be.true
    expect(results[0].notice).to.be.eq('Adds two numbers')
  })
})