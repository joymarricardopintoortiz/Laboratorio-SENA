// Lee variables de entorno desde .env y las valida con zod.
// Si falta algo obligatorio, el proceso falla rápido con un mensaje claro.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI es obligatoria'),
  // Mínimo 32 caracteres: un secreto corto es adivinable y compromete todos los tokens.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres (largo y aleatorio)'),
  // Saltos de proxy que Express debe confiar para leer la IP real (req.ip).
  // Vacío = desactivado. Ejemplos: '1' (Render/Heroku/nginx), 'loopback'.
  TRUST_PROXY: z.string().optional().default(''),
  JWT_EXPIRES_IN: z.string().default('8h'),
  MAIL_HOST: z.string().optional().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_USER: z.string().optional().default(''),
  MAIL_APP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  MAX_FILE_MB: z.coerce.number().int().positive().default(5),
  // URL pública (frontend) para armar los enlaces de la encuesta y del informe.
  FRONTEND_URL: z.string().optional().default(''),
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
