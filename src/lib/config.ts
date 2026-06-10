import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex characters (32 bytes)"),
  AUTH_SECRET: z.string().min(16, "Must be at least 16 characters"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ADMIN_PORT: z.coerce.number().default(3000),
  MCP_PORT: z.coerce.number().default(3001),
  MCP_BASE_URL: z.string().default("http://localhost:3001"),
  APP_URL: z.string().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}
