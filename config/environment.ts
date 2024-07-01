import * as dotenv from 'dotenv'

export const loadConfig = (path: string) => dotenv.config({ path })
