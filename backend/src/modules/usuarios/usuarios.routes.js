// Rutas del módulo usuarios: gestión de usuarios del sistema interno.
// EXCLUSIVO del rol admin (requireRole('admin') en cada ruta).
import { Router } from 'express';
import * as controller from './usuarios.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearUsuarioSchema, actualizarUsuarioSchema, estadoUsuarioSchema } from './usuarios.schema.js';

const router = Router();
router.use(auth);
router.use(requireRole('admin'));

router.get('/', controller.listar);
router.get('/:id', controller.obtener);
router.post('/', validate(crearUsuarioSchema), controller.crear);
router.put('/:id', validate(actualizarUsuarioSchema), controller.actualizar);
router.patch('/:id/estado', validate(estadoUsuarioSchema), controller.cambiarEstado);
router.delete('/:id', controller.eliminar);

export default router;
