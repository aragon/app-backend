export interface IRewardEntry {
  address: string
  amount: string
}

export interface IMerkleTreeLeaf {
  address: string
  amount: string
}

export interface IMemberWithProof {
  address: string
  amount: string
  proof: string[]
  leaf: string
}

export interface IMerkleTreeWithProofs {
  merkleRoot: string
  members: IMemberWithProof[]
}
