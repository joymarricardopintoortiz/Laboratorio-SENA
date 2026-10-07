// Configuración global de Express: middlewares y montaje de rutas.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { routes } from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
