// Esquemas de validación zod de cotizaciones.
import { z } from 'zod';

export const crearCotizacionSchema = z.object({
  solicitud: z.string().min(1, 'La solicitud es obligatoria'),
  items: z
    .array(
      z.object({
        parametro: z.string().min(1, 'El parámetro es obligatorio'),
        descripcion: z.string().max(200, 'La descripción no puede superar los 200 caracteres').optional(),
        cantidad: z.number().int().min(1, 'La cantidad mínima es 1'),
      })
    )
    .min(1, 'La cotización debe tener al menos un ítem'),
});
