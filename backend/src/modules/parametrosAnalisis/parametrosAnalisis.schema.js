// Esquemas de validación zod de parametrosAnalisis.
import { z } from 'zod';

export const crearParametroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  descripcion: z.string().optional(),
  precio: z.number().min(0, 'El precio no puede ser negativo'),
  unidad: z.string().optional(),
  activo: z.boolean().optional(),
});

export const actualizarParametroSchema = crearParametroSchema.partial();
