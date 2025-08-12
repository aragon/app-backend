import { AbiCoder, solidityPackedKeccak256, getAddress } from 'ethers'
import { type IMerkleProof } from '@helpers/merkleTree'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helpers:ClaimAuxData' })

export interface IClaimAuxData {
  recipient: string
  amount: string
  proof: string[]
}

export interface IEncodedClaimData {
  auxData: string
  hash: string
}

const ClaimAuxDataHelper = {
  encodeClaimAuxData: (recipient: string, amount: string, proof: string[]): IEncodedClaimData => {
    try {
      const normalizedRecipient = getAddress(recipient.toLowerCase())

      const abiCoder = AbiCoder.defaultAbiCoder()

      const auxData = abiCoder.encode(['address', 'uint256', 'bytes32[]'], [normalizedRecipient, amount, proof])

      const hash = solidityPackedKeccak256(['address', 'uint256', 'bytes32[]'], [normalizedRecipient, amount, proof])

      logger.debug(
        'Claim aux data encoded',
        llo({
          recipient: normalizedRecipient,
          amount,
          proofLength: proof.length,
          auxDataLength: auxData.length,
          hash,
        }),
      )

      return {
        auxData,
        hash,
      }
    } catch (error) {
      logger.error(
        'Error encoding claim aux data',
        llo({
          error,
          recipient,
          amount,
          proofLength: proof?.length,
        }),
      )
      throw error
    }
  },

  encodeFromMerkleProof: (userAddress: string, merkleProof: IMerkleProof): IEncodedClaimData => {
    try {
      return ClaimAuxDataHelper.encodeClaimAuxData(userAddress, merkleProof.amount, merkleProof.proof)
    } catch (error) {
      logger.error(
        'Error encoding from merkle proof',
        llo({
          error,
          userAddress,
          merkleProofAmount: merkleProof?.amount,
          merkleProofLength: merkleProof?.proof?.length,
        }),
      )
      throw error
    }
  },

  decodeClaimAuxData: (auxData: string): IClaimAuxData => {
    try {
      const abiCoder = AbiCoder.defaultAbiCoder()

      const decoded = abiCoder.decode(['address', 'uint256', 'bytes32[]'], auxData)

      const [recipient, amount, proof] = decoded

      const result: IClaimAuxData = {
        recipient: getAddress(recipient.toLowerCase()),
        amount: amount.toString(),
        proof: proof as string[],
      }

      logger.debug(
        'Claim aux data decoded',
        llo({
          recipient: result.recipient,
          amount: result.amount,
          proofLength: result.proof.length,
          auxDataLength: auxData.length,
        }),
      )

      return result
    } catch (error) {
      logger.error(
        'Error decoding claim aux data',
        llo({
          error,
          auxDataLength: auxData?.length,
        }),
      )
      throw error
    }
  },

  validateClaimAuxData: (
    auxData: string,
    expectedRecipient: string,
    expectedAmount: string,
    expectedProofLength?: number,
  ): boolean => {
    try {
      const decoded = ClaimAuxDataHelper.decodeClaimAuxData(auxData)
      const normalizedExpectedRecipient = getAddress(expectedRecipient.toLowerCase())

      const isRecipientValid = decoded.recipient === normalizedExpectedRecipient
      const isAmountValid = decoded.amount === expectedAmount
      const isProofLengthValid = expectedProofLength ? decoded.proof.length === expectedProofLength : true

      const isValid = isRecipientValid && isAmountValid && isProofLengthValid

      logger.debug(
        'Claim aux data validation',
        llo({
          expectedRecipient: normalizedExpectedRecipient,
          actualRecipient: decoded.recipient,
          expectedAmount,
          actualAmount: decoded.amount,
          expectedProofLength,
          actualProofLength: decoded.proof.length,
          isValid,
          isRecipientValid,
          isAmountValid,
          isProofLengthValid,
        }),
      )

      return isValid
    } catch (error) {
      logger.error(
        'Error validating claim aux data',
        llo({
          error,
          expectedRecipient,
          expectedAmount,
          auxDataLength: auxData?.length,
        }),
      )
      return false
    }
  },

  createClaimDataForUser: (
    userAddress: string,
    amount: string,
    proof: string[],
  ): { auxData: string; hash: string; claimData: IClaimAuxData } => {
    try {
      const encoded = ClaimAuxDataHelper.encodeClaimAuxData(userAddress, amount, proof)
      const claimData: IClaimAuxData = {
        recipient: getAddress(userAddress.toLowerCase()),
        amount,
        proof,
      }

      logger.info(
        'Claim data created for user',
        llo({
          recipient: claimData.recipient,
          amount: claimData.amount,
          proofLength: claimData.proof.length,
          auxDataLength: encoded.auxData.length,
        }),
      )

      return {
        auxData: encoded.auxData,
        hash: encoded.hash,
        claimData,
      }
    } catch (error) {
      logger.error(
        'Error creating claim data for user',
        llo({
          error,
          userAddress,
          amount,
          proofLength: proof?.length,
        }),
      )
      throw error
    }
  },
}

export default ClaimAuxDataHelper
