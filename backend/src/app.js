// Configuración global de Express: middlewares y montaje de rutas.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { routes } from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Proxy inverso (Render, Heroku, nginx...): solo se confía si TRUST_PROXY está
// definido en .env. Sin esto, detrás de un proxy todas las IPs se ven iguales y
// el rate limit por IP deja de servir. '1' = un salto; también admite 'true'
// (equivalente a 1) o 'loopback'.
if (env.TRUST_PROXY) {
  const saltos = env.TRUST_PROXY === 'true' ? 1 : Number(env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(saltos) ? env.TRUST_PROXY : saltos);
}

app.use(helmet());

// CORS: solo las URLs del front configuradas en FRONTEND_URL (se pueden poner
// varias separadas por coma). Si FRONTEND_URL está vacío se permite cualquiera.
// Las peticiones sin cabecera Origin (curl, scripts, pruebas) siempre pasan.
const orignesPermitidas = (env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origen, continuar) => {
      if (!origen || orignesPermitidas.length === 0) return continuar(null, true);
      continuar(null, orignesPermitidas.includes(origen));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Límite general de peticiones por IP (RNF-013). /api/publico tiene además un
// límite mucho más estricto de 30 consultas por minuto en routes/publico.routes.
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      mensaje: 'Demasiadas peticiones desde esta dirección IP. Intenta de nuevo en unos minutos.',
    });
  },
});
app.use('/api', limiteGeneral);

// GET /api/health: informa el estado de la conexión a la base de datos.
app.get('/api/health', (req, res) => {
  const estados = { 0: 'desconectada', 1: 'conectada', 2: 'conectando', 3: 'desconectando' };
  const estado = estados[mongoose.connection.readyState] || 'desconocido';
  res.json({
    ok: true,
    mensaje: 'API funcionando',
    baseDatos: estado,
    uptime: process.uptime(),
    fecha: new Date().toISOString(),
  });
});

app.use('/api', routes);

// 404 y manejador de errores en JSON (Fase 1 completa notFound/errorHandler).
app.use(notFound);
app.use(errorHandler);

export default app;
