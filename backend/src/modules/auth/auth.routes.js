// Rutas del módulo auth.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { loginSchema, actualizarPerfilSchema } from './auth.schema.js';

const router = Router();

// Fuerza bruta sobre el login: máximo 20 intentos cada 15 minutos por IP.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      mensaje:
        'Demasiados intentos de inicio de sesión. Espera unos minutos antes de intentarlo de nuevo.',
    });
  },
});

router.post('/login', limiteLogin, validate(loginSchema), controller.login);
router.get('/perfil', auth, controller.perfil);
router.put('/perfil', auth, validate(actualizarPerfilSchema), controller.actualizarPerfil);

export default router;
