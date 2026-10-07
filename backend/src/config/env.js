// Lee variables de entorno desde .env y las valida con zod.
// Si falta algo obligatorio, el proceso falla rápido con un mensaje claro.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI es obligatoria'),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET debe ser largo y aleatorio'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  MAIL_HOST: z.string().optional().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_USER: z.string().optional().default(''),
  MAIL_APP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  MAX_FILE_MB: z.coerce.number().int().positive().default(5),
  FACTUS_BASE_URL: z.string().optional().default(''),
  FACTUS_CLIENT_ID: z.string().optional().default(''),
  FACTUS_CLIENT_SECRET: z.string().optional().default(''),
  // Datos del admin inicial para scripts/seed.js
  ADMIN_NOMBRE: z.string().optional().default('Administrador'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of result.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('Revisa tu archivo .env basándote en .env.example');
  process.exit(1);
}

export const env = result.data;
