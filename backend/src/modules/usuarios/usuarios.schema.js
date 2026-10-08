// Esquemas de validación zod del módulo usuarios (gestión solo admin).
import { z } from 'zod';
import { ROLES } from '../../config/constants.js';

const permisosSchema = z.object({
  editar: z.boolean().optional().default(false),
  eliminar: z.boolean().optional().default(false),
});

// POST /api/interno/usuarios — crear usuario interno.
export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120, 'El nombre no puede superar los 120 caracteres'),
  email: z.string().trim().email('Correo inválido').toLowerCase(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100, 'La contraseña no puede superar los 100 caracteres'),
  rol: z.enum(ROLES, { message: `El rol debe ser uno de: ${ROLES.join(', ')}` }),
  permisos: permisosSchema.optional(),
});

// PUT /api/interno/usuarios/:id — actualizar rol y/o permisos.
export const actualizarUsuarioSchema = z
  .object({
    rol: z.enum(ROLES, { message: `El rol debe ser uno de: ${ROLES.join(', ')}` }).optional(),
    permisos: permisosSchema.optional(),
  })
  .refine((d) => d.rol !== undefined || d.permisos !== undefined, {
    message: 'Envía el rol o los permisos para actualizar',
  });

// PATCH /api/interno/usuarios/:id/estado — activar o desactivar la cuenta.
export const estadoUsuarioSchema = z.object({
  activo: z.boolean({ error: 'El campo activo debe ser true (activar) o false (desactivar)' }),
});
