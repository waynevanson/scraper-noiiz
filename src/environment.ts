import { config as dotenv } from "dotenv"
import * as zod from "zod"

export interface Environment {
  NOIIZ_EMAIL: string
  NOIIZ_PASSWORD: string
  DOWNLOAD_CONCURRENCY: number
  STATE_DIR: string
}

export function createEnvironment(): Environment {
  const env = dotenv({ processEnv: {} })

  if (env.error) {
    throw env.error
  }

  const schema = zod.strictObject({
    NOIIZ_EMAIL: zod.string(),
    NOIIZ_PASSWORD: zod.string(),
    DOWNLOAD_CONCURRENCY: zod.number({ coerce: true }),
    STATE_DIR: zod.string(),
  })

  const validation: Environment = schema.parse(env.parsed)

  return validation
}
