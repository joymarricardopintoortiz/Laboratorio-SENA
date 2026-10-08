// Cálculo de días hábiles (RF-086, Fase 7).
// Un día es hábil si NO es sábado, domingo NI festivo de la lista editable
// de constants.js (festivos de Colombia).
import { FESTIVOS_COLOMBIA } from '../config/constants.js';

// Normaliza la entrada a Date. Un 'AAAA-MM-DD' literal se interpreta en HORA
// LOCAL: si no, en Colombia (UTC-5) un 2026-05-01 se leería como 2026-04-30 y
// el cálculo se correría un día.
export function aFecha(entrada) {
  const texto = String(entrada ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [anio, mes, dia] = texto.split('-').map(Number);
    return new Date(anio, mes - 1, dia, 12, 0, 0, 0); // mediodía local
  }
  return new Date(entrada);
}

// 'AAAA-MM-DD' usando la fecha en hora local (sin corrimiento por zona horaria).
export function claveFecha(fecha) {
  const d = aFecha(fecha);
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export function esFinDeSemana(fecha) {
  const dia = aFecha(fecha).getDay();
  return dia === 0 || dia === 6;
}

export function esFestivo(fecha, festivos = FESTIVOS_COLOMBIA) {
  const clave = claveFecha(fecha);
  return festivos.includes(clave);
}

export function esHabil(fecha, festivos = FESTIVOS_COLOMBIA) {
  return !esFinDeSemana(fecha) && !esFestivo(fecha, festivos);
}

// Suma N días hábiles a una fecha (no cuenta el día de origen).
// Ej.: viernes + 1 = lunes; viernes festivo + 1 = lunes siguiente.
export function sumarDiasHabiles(fecha, dias, festivos = FESTIVOS_COLOMBIA) {
  const cantidad = Number(dias);
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    throw new Error('La cantidad de días hábiles debe ser un entero mayor o igual a 0');
  }

  const actual = aFecha(fecha);
  actual.setHours(0, 0, 0, 0); // normaliza a medianoche local

  let contados = 0;
  let guardados = 0;
  // Tope de seguridad: como máximo se recorren cantidad * 3 + 30 días naturales
  // (30 cubre festivos acumulados y largas rachas de fines de semana).
  const tope = cantidad * 3 + 30;

  while (contados < cantidad && guardados < tope) {
    actual.setDate(actual.getDate() + 1);
    guardados += 1;
    if (esHabil(actual, festivos)) contados += 1;
  }

  return actual;
}
