// Rutas base de la API.
import { Router } from 'express';
import internoRoutes from './interno.routes.js';
import publicoRoutes from './publico.routes.js';

export const routes = Router();

routes.use('/interno', internoRoutes);
routes.use('/publico', publicoRoutes);
