import { config as dotenv } from "dotenv"
import * as zod from "zod"

export interface Environment {
  email: string
  password: string
  concurrency: number
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
  })

  const validation = schema.parse(env.parsed)

  return validation
}
