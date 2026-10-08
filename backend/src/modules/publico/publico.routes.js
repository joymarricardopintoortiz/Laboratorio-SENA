// Rutas de la API pública /api/publico/* (sin login).
// RF-076: solo GET para la consulta + un único POST para responder una incidencia.
// El resto de métodos queda bloqueado (RNF-005) por el middleware final.
import { Router } from 'express';
import * as controller from './publico.controller.js';
import { validate } from '../../middlewares/validate.js';
import { subirArchivos } from '../../middlewares/upload.js';
import { AppError } from '../../utils/AppError.js';
import { responderIncidenciaSchema } from './publico.schema.js';

const router = Router();

// 1) Consulta pública de seguimiento (solo lectura).
router.get('/seguimiento/:codigoSeguimiento', controller.seguimiento);

// 2) Respuesta del cliente a una incidencia que espera respuesta.
//    Multer primero (llena req.body con los campos de texto) y luego zod.
router.post(
  '/seguimiento/:codigoSeguimiento/incidencias/:incidenciaId/respuesta',
  subirArchivos('archivos', 3),
  validate(responderIncidenciaSchema),
  controller.responder
);

// RNF-005: /api/publico no admite ningún otro método.
// GET desconocida → 404; cualquier otro método → 405 (siempre JSON, en español).
router.use((req, res, next) => {
  if (req.method === 'GET') {
    return next(new AppError(`Ruta pública no encontrada: ${req.method} ${req.originalUrl}`, 404));
  }
  return next(new AppError(`Método ${req.method} no permitido en la API pública (solo lectura)`, 405));
});

export default router;
