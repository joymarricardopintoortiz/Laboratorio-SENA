// Rutas del módulo solicitudes.
import { Router } from 'express';
import * as controller from './solicitudes.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearSolicitudSchema, actualizarSolicitudSchema } from './solicitudes.schema.js';

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);
router.post('/', requireRole('admin', 'encargado'), validate(crearSolicitudSchema), controller.crear);
router.put('/:id', requireRole('admin', 'encargado'), validate(actualizarSolicitudSchema), controller.actualizar);
router.delete('/:id', requireRole('admin'), controller.eliminar);

export default router;
