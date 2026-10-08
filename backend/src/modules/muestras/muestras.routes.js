// Rutas del módulo muestras.
import { Router } from 'express';
import * as controller from './muestras.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import {
  recibirMuestraSchema,
  rechazarSchema,
  parametrosSchema,
  ubicacionSchema,
  actualizarMuestraSchema,
} from './muestras.schema.js';
import { requirePermiso } from '../../middlewares/requireRole.js';
import { z } from 'zod';

const estadoSchema = z.object({
  estadoNuevo: z.enum(['ingresada', 'en_proceso', 'en_analisis', 'resultados_validados', 'cerrada', 'rechazada', 'en_almacen', 'devuelta', 'desechada']),
  motivo: z.string().optional(),
});

const observacionSchema = z.object({
  descripcion: z.string().min(1, 'La descripción es obligatoria'),
  visibleCliente: z.boolean().optional(),
});

const fechaSchema = z.object({
  fechaNueva: z.string().min(1, 'La nueva fecha es obligatoria'),
  motivo: z.string().min(1, 'El motivo es obligatorio'),
});

const correccionSchema = z.object({
  nombreMuestra: z.string().optional(),
  descripcion: z.string().optional(),
  verificacionFisica: z.boolean().optional(),
  fechaEstimadaEntrega: z.string().optional(),
  fechaLimiteConservacion: z.string().optional(),
  descripcionCorreccion: z.string().optional(),
});

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
// RF-092: debe ir ANTES de '/:id' para no ser capturado como un id.
router.get('/pendientes-disposicion', requireRole('admin', 'encargado', 'usuario'), controller.pendientesDisposicion);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);
router.post('/', requireRole('admin', 'encargado'), validate(recibirMuestraSchema), controller.recibir);
router.put('/:id', requireRole('admin', 'encargado'), validate(actualizarMuestraSchema), controller.actualizar);
router.delete('/:id', requireRole('admin', 'encargado', 'usuario'), requirePermiso('eliminar'), controller.eliminar);

router.post('/:id/aceptar', requireRole('admin', 'encargado'), controller.aceptar);
router.post('/:id/rechazar', requireRole('admin', 'encargado'), validate(rechazarSchema), controller.rechazar);
router.patch('/:id/parametros', requireRole('admin', 'encargado'), validate(parametrosSchema), controller.seleccionarParametros);
router.post('/:id/rotulo', requireRole('admin', 'encargado'), controller.generarRotulo);
router.get('/:id/rotulo/descargar', requireRole('admin', 'encargado', 'usuario'), controller.descargarRotulo);
router.patch('/:id/ubicacion', requireRole('admin', 'encargado'), validate(ubicacionSchema), controller.ubicacion);

router.patch('/:id/estado', requireRole('admin', 'encargado'), validate(estadoSchema), controller.cambiarEstado);
router.get('/:id/trazabilidad', requireRole('admin', 'encargado', 'usuario'), controller.historial);
router.post('/:id/observaciones', requireRole('admin', 'encargado'), validate(observacionSchema), controller.observacion);
router.put('/:id/corregir', requireRole('admin', 'encargado'), validate(correccionSchema), controller.corregir);
router.post('/:id/iniciar', requireRole('admin', 'encargado'), controller.iniciar);
router.post('/:id/cerrar', requireRole('admin', 'encargado'), controller.cerrar);
router.patch('/:id/fecha-estimada', requireRole('admin', 'encargado'), validate(fechaSchema), controller.cambiarFecha);
router.get('/:id/cambios-fecha', requireRole('admin', 'encargado', 'usuario'), controller.historialFechas);

export default router;
