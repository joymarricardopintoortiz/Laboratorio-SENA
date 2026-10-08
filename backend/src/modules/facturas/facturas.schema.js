// Esquemas de validación zod del módulo facturas.
import { z } from 'zod';
import { ESTADOS_FACTURA } from './facturas.model.js';

export const generarFacturaSchema = z.object({
  solicitudId: z.string().min(1, 'La solicitud es obligatoria'),
  pagoId: z.string().min(1).optional(),
});

// Cambiar estado: el motivo SIEMPRE queda en historialEstados y en auditoría.
export const cambiarEstadoFacturaSchema = z.object({
  estado: z.enum(ESTADOS_FACTURA, { message: 'Estado de factura no válido' }),
  motivo: z.string().trim().min(3, 'El motivo debe tener al menos 3 caracteres'),
});

export const listarFacturasSchema = z.object({
  solicitudId: z.string().min(1).optional(),
  solicitud: z.string().min(1).optional(),
  estado: z.enum(ESTADOS_FACTURA).optional(),
});
