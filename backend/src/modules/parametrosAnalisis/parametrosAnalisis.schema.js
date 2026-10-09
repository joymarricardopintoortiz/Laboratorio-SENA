// Esquemas de validación zod de parametrosAnalisis.
import { z } from 'zod';

export const crearParametroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(100, 'El nombre no puede superar los 100 caracteres'),
  descripcion: z.string().optional(),
  precio: z.number().min(0, 'El precio no puede ser negativo'),
  unidad: z.string().max(20, 'La unidad no puede superar los 20 caracteres').optional(),
  activo: z.boolean().optional(),
});

export const actualizarParametroSchema = crearParametroSchema.partial();
