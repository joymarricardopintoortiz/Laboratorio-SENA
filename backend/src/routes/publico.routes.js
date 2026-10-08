// Rutas públicas /api/publico/* (sin auth, solo lectura por código).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import publicoRoutes from '../modules/publico/publico.routes.js';

const router = Router();

// RF-084 / RNF-013: máximo 30 consultas por minuto por IP, para que nadie
// pueda "adivinar" códigos de seguimiento por fuerza bruta.
const limiteConsultas = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // La respuesta del cliente a una incidencia no es una "consulta de código"
  // y no debe quedar bloqueada por este límite.
  skip: (req) => req.method === 'POST',
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      mensaje: 'Demasiadas consultas desde esta dirección IP. Intenta de nuevo en unos minutos.',
    });
  },
});

// Límite PROPIO de los POST de la superficie pública (respuesta a incidencia y
// respuesta a la encuesta): máximo 10 cada 15 minutos por IP. Es independiente
// del de consultas: quien consulta muchas veces no consume la cuota de
// publicación y viceversa.
const limitePublicaciones = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Solo los POST consumen esta cuota; las consultas (GET) no.
  skip: (req) => req.method !== 'POST',
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      mensaje:
        'Demasiadas publicaciones desde esta dirección IP. Intenta de nuevo en unos minutos.',
    });
  },
});

router.use(limiteConsultas);
router.use(limitePublicaciones);
router.use(publicoRoutes);

export default router;
