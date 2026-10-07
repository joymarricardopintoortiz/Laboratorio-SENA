// Rutas del catálogo parametrosAnalisis.
import { Router } from 'express';
import * as controller from './parametrosAnalisis.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearParametroSchema, actualizarParametroSchema } from './parametrosAnalisis.schema.js';

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);
router.post('/', requireRole('admin', 'encargado'), validate(crearParametroSchema), controller.crear);
router.put('/:id', requireRole('admin', 'encargado'), validate(actualizarParametroSchema), controller.actualizar);
router.delete('/:id', requireRole('admin'), controller.eliminar);

export default router;
