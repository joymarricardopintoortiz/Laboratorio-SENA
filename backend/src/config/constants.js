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

// Días hábiles que se conserva la muestra después de cerrar el proceso (RF-086).
export const DIAS_CONSERVACION = 7;

// Festivos de Colombia (lista EDITABLE). Los sábados y domingos se excluyen
// aparte en utils/diasHabiles.js. Formato: 'AAAA-MM-DD'.
export const FESTIVOS_COLOMBIA = [
  '2026-01-01', // Año Nuevo
  '2026-01-06', // Reyes Magos
  '2026-04-02', // Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajo
  '2026-05-14', // Ascensión del Señor
  '2026-06-04', // Corpus Christi
  '2026-06-12', // Sagrado Corazón de Jesús
  '2026-06-29', // San Pedro y San Pablo
  '2026-07-20', // Independencia de Colombia
  '2026-08-07', // Batalla de Boyacá
  '2026-10-12', // Día de la Raza
  '2026-11-02', // Todos los Santos
  '2026-11-11', // Independencia de Cartagena
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
  '2027-01-01', // Año Nuevo
];

// Preguntas de la encuesta de satisfacción (RF-099).
export const PREGUNTAS_ENCUESTA = [
  '¿Cómo calificas la atención recibida por el laboratorio?',
  '¿Qué tan claro y completo te pareció el informe entregado?',
  '¿Cumplimos con los tiempos de entrega estimados?',
  '¿Recomendarías nuestro laboratorio a otras personas?',
];
