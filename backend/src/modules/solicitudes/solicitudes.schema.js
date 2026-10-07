// Esquemas de validación zod del módulo solicitudes.
import { z } from 'zod';

export const crearSolicitudSchema = z
  .object({
    cliente: z.string().min(1, 'El cliente es obligatorio'),
    tipoCliente: z.enum(['interno', 'externo']),
    descripcion: z.string().optional(),
    prioridad: z.enum(['baja', 'media', 'alta']).optional(),
    atencionInmediata: z.boolean().optional(),
    motivoAtencionInmediata: z.string().optional(),
  })
  .refine((d) => !d.atencionInmediata || (d.motivoAtencionInmediata && d.motivoAtencionInmediata.trim().length > 0), {
    message: 'El motivo es obligatorio cuando hay atención inmediata',
    path: ['motivoAtencionInmediata'],
  });

export const actualizarSolicitudSchema = z.object({
  descripcion: z.string().optional(),
  prioridad: z.enum(['baja', 'media', 'alta']).optional(),
  atencionInmediata: z.boolean().optional(),
  motivoAtencionInmediata: z.string().optional(),
  estado: z.enum(['pendiente', 'cotizada', 'aceptada', 'pagada', 'rechazada']).optional(),
});
