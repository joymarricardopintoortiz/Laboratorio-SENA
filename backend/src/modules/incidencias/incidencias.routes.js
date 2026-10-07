// Rutas del módulo incidencias (+ respuestas con adjuntos).
import { Router } from 'express';
import * as controller from './incidencias.controller.js';
import * as respController from './respuestasIncidencias.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole, requirePermiso } from '../../middlewares/requireRole.js';
import { subirArchivos } from '../../middlewares/upload.js';
import { crearIncidenciaSchema, actualizarIncidenciaSchema, cerrarSchema } from './incidencias.schema.js';

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);
router.get('/:id/publica', requireRole('admin', 'encargado', 'usuario'), controller.vistaPublica);
router.post('/', requireRole('admin', 'encargado'), validate(crearIncidenciaSchema), controller.crear);
router.put('/:id', requireRole('admin', 'encargado'), validate(actualizarIncidenciaSchema), controller.actualizar);
router.patch('/:id/aprobar', requireRole('admin', 'encargado'), controller.aprobar);
router.patch('/:id/cerrar', requireRole('admin', 'encargado'), validate(cerrarSchema), controller.cerrar);
router.delete('/:id', requirePermiso('eliminar'), controller.eliminar);

// Respuestas con adjuntos (máx 3, solo PDF/JPG/PNG, límite MAX_FILE_MB).
router.post('/:id/respuestas', requireRole('admin', 'encargado', 'usuario'), subirArchivos('archivos', 3), respController.crear);
router.get('/:id/respuestas', requireRole('admin', 'encargado', 'usuario'), respController.porIncidencia);
router.get('/respuestas/:rid/archivos/:index', requireRole('admin', 'encargado', 'usuario'), respController.descargar);

export default router;
