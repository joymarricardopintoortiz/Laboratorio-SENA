// Esquemas de validación zod para auth.
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const actualizarPerfilSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
  })
  .refine((d) => d.nombre || d.password, { message: 'Envía nombre o password para actualizar' });
