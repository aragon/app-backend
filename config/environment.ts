import * as dotenv from 'dotenv'
import path from 'path'

export const loadConfig = (dir: string) => dotenv.config({ path: path.resolve(__dirname, dir) })
