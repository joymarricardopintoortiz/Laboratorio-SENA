// Rutas del módulo clientes. Usuario solo lectura; admin/encargado gestionan.
import { Router } from 'express';
import * as controller from './clientes.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearClienteSchema, actualizarClienteSchema } from './clientes.schema.js';

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);
router.post('/', requireRole('admin', 'encargado'), validate(crearClienteSchema), controller.crear);
router.put('/:id', requireRole('admin', 'encargado'), validate(actualizarClienteSchema), controller.actualizar);
router.delete('/:id', requireRole('admin'), controller.eliminar);

export default router;
