// Rutas del módulo auth.
import { Router } from 'express';
import * as controller from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { loginSchema, actualizarPerfilSchema } from './auth.schema.js';

const router = Router();

router.post('/login', validate(loginSchema), controller.login);
router.get('/perfil', auth, controller.perfil);
router.put('/perfil', auth, validate(actualizarPerfilSchema), controller.actualizarPerfil);

export default router;
