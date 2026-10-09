// Esquemas de validación zod para auth.
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido').max(150, 'El correo no puede superar los 150 caracteres'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const actualizarPerfilSchema = z
  .object({
    nombre: z.string().min(1).max(120, 'El nombre no puede superar los 120 caracteres').optional(),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
  })
  .refine((d) => d.nombre || d.password, { message: 'Envía nombre o password para actualizar' });
