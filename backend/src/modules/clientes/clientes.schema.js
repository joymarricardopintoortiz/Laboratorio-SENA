// Esquemas de validación zod del módulo clientes.
import { z } from 'zod';

export const crearClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  tipoDocumento: z.enum(['CC', 'NIT', 'CE', 'TI']).optional(),
  numeroDocumento: z.string().min(1, 'El documento es obligatorio'),
  email: z.string().email('Correo inválido'),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  tipoCliente: z.enum(['interno', 'externo'], { message: 'tipoCliente debe ser interno o externo' }),
});

export const actualizarClienteSchema = crearClienteSchema.partial();
