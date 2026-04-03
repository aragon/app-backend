import { getWallet } from './wallet'

export const DEPLOYER_ADDRESS = () => getWallet().address
export const DEPLOYER_PRIVATE_KEY = () => getWallet().privateKey
