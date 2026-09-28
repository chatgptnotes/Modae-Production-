import { z } from 'zod'

const optionalText = z.preprocess(value => {
  const text = String(value ?? '').trim()
  return text || undefined
}, z.string().min(1).optional())

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SUPABASE_URL: optionalText.pipe(z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  SUPABASE_ANON_KEY: optionalText,
  CORS_ORIGINS: z.preprocess(value => String(value ?? ''), z.string())
    .transform(value => value.split(',').map(origin => origin.trim()).filter(Boolean)),
  GMAIL_ACCOUNT: optionalText.pipe(z.string().email().optional()),
  GMAIL_APP_PASSWORD: optionalText,
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production') {
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'] as const) {
      if (!value[key]) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production.` })
    }
  }
  if (Boolean(value.GMAIL_ACCOUNT) !== Boolean(value.GMAIL_APP_PASSWORD)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['GMAIL_ACCOUNT'], message: 'GMAIL_ACCOUNT and GMAIL_APP_PASSWORD must be configured together.' })
  }
})

export function assertRuntimeConfig(env = process.env) {
  const parsed = runtimeEnvSchema.safeParse(env)
  if (!parsed.success) {
    const messages = parsed.error.issues.map(issue => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    throw new Error(`Invalid runtime configuration: ${messages.join('; ')}`)
  }
  return {
    ...parsed.data,
    port: parsed.data.PORT,
    corsOrigins: parsed.data.CORS_ORIGINS,
    gmailAccount: parsed.data.GMAIL_ACCOUNT,
    gmailAppPassword: parsed.data.GMAIL_APP_PASSWORD,
  }
}
