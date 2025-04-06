import { config as dotenv } from "dotenv"
import * as zod from "zod"

export interface Environment {
  NOIIZ_EMAIL: string
  NOIIZ_PASSWORD: string
  STATE_DIR: string
  SKIP_CATALOGUE: boolean
}

export function createEnvironment(): Environment {
  const env = dotenv({ processEnv: {} })

  if (env.error) {
    throw env.error
  }

  const schema = zod.strictObject({
    NOIIZ_EMAIL: zod.string(),
    NOIIZ_PASSWORD: zod.string(),
    STATE_DIR: zod.string(),
    SKIP_CATALOGUE: zod.boolean({ coerce: true }).default(false),
  })

  const validation: Environment = schema.parse(env.parsed)

  return validation
}
