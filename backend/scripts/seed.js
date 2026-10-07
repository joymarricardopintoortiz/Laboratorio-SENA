// Siembra inicial: crea el admin leyendo ADMIN_NOMBRE, ADMIN_EMAIL y
// ADMIN_PASSWORD del .env. Si ya existe, no lo duplica.
import { conectarDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Usuario } from '../src/modules/usuarios/usuarios.model.js';
import { ParametroAnalisis } from '../src/modules/parametrosAnalisis/parametrosAnalisis.model.js';

const PARAMETROS_EJEMPLO = [
  { nombre: 'pH del agua', descripcion: 'Medición de acidez/alcalinidad', precio: 15000, unidad: 'pH' },
  { nombre: 'Turbidez', descripcion: 'Claridad del agua', precio: 20000, unidad: 'NTU' },
  { nombre: 'Coliformes totales', descripcion: 'Indicador microbiológico', precio: 45000, unidad: 'UFC/100ml' },
  { nombre: 'Nitratos', descripcion: 'Concentración de nitratos', precio: 30000, unidad: 'mg/L' },
  { nombre: 'DBO5', descripcion: 'Demanda bioquímica de oxígeno', precio: 60000, unidad: 'mg/L' },
];

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error('❌ Define ADMIN_EMAIL y ADMIN_PASSWORD en el .env antes de sembrar.');
    process.exit(1);
  }

  await conectarDB();

  const existente = await Usuario.findOne({ email: env.ADMIN_EMAIL });
  if (existente) {
    console.log(`ℹ️  El admin ${env.ADMIN_EMAIL} ya existe; no se creó de nuevo.`);
  } else {
    await Usuario.create({
      nombre: env.ADMIN_NOMBRE,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD, // el pre-save lo hashea
      rol: 'admin',
      permisos: { editar: true, eliminar: true },
    });
    console.log(`✅ Admin inicial creado: ${env.ADMIN_EMAIL}`);
  }

  // Catálogo inicial de parámetros de análisis (de ejemplo).
  for (const p of PARAMETROS_EJEMPLO) {
    const existeP = await ParametroAnalisis.findOne({ nombre: p.nombre });
    if (!existeP) await ParametroAnalisis.create(p);
  }
  console.log(`✅ Catálogo de parámetros sembrado (${PARAMETROS_EJEMPLO.length} ejemplos).`);

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error en seed:', e.message);
  process.exit(1);
});
