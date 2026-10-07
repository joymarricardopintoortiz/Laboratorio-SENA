// Constantes globales: roles, estados y tipos (una sola fuente de verdad).
// Según el plan, los estados de la muestra viven aquí y se cambian solo aquí.

export const ROLES = ['admin', 'encargado', 'usuario'];

export const ESTADOS_MUESTRA = [
  'ingresada',
  'en_proceso',
  'en_analisis',
  'resultados_validados',
  'cerrada',
  'rechazada',
  'en_almacen',
  'devuelta',
  'desechada',
];

export const TIPOS_FISICOS = ['solido', 'liquido'];

export const TIPOS_CLIENTE = ['interno', 'externo'];
