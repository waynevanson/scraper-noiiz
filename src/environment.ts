import { config as dotenv } from "dotenv"
import * as zod from "zod"
import { main } from "./logs"

export interface Environment {
  email: string
  password: string
  concurrency: number
  state: string
}

export function createEnvironment(): Environment {
  const env = dotenv({ processEnv: {} })

  if (env.error) {
    throw env.error
  }

  const schema = zod.strictObject({
    email: zod.string(),
    password: zod.string(),
    concurrency: zod.number({ coerce: true }),
    state: zod.string(),
  })

  const validation: Environment = schema.parse(env.parsed)

  return validation
}
