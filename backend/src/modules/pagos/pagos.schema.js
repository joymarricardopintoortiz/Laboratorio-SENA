// Esquemas de validación zod de pagos.
import { z } from 'zod';

export const crearPagoSchema = z.object({
  cotizacion: z.string().min(1, 'La cotización es obligatoria'),
});
