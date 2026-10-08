// Lógica de gestión de usuarios del sistema interno (solo rol admin).
// Reglas:
// - El hash del password NUNCA se devuelve (select:false + limpieza explícita).
// - Toda modificación registra auditoría con antes/después (append-only).
// - Un administrador no puede desactivarse, eliminarse a sí mismo ni quitarse el rol.
import { isValidObjectId } from 'mongoose';
import { Usuario } from './usuarios.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';

// Lista blanca de campos de usuario que salen en las respuestas.
const sinPassword = (doc) => {
  const obj = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj.password;
  return obj;
};

const esMismoUsuario = (id, responsableId) => String(id) === String(responsableId);

export async function listar() {
  const usuarios = await Usuario.find().sort({ createdAt: -1 });
  return usuarios.map(sinPassword);
}

export async function obtener(id) {
  if (!isValidObjectId(id)) throw new AppError('Identificador de usuario no válido', 400);
  const usuario = await Usuario.findById(id);
  if (!usuario) throw new AppError('Usuario no encontrado', 404);
  return sinPassword(usuario);
}

export async function crear(datos, responsable) {
  // El email es único; se comprueba también contra usuarios borrados lógicamente
  // porque el índice único de MongoDB sigue ocupando el correo.
  const existe = await Usuario.findOne({ email: datos.email });
  const existeBorrado = existe ? null : await Usuario.findOne({ email: datos.email, eliminado: true });
  if (existe) throw new AppError('Ya existe un usuario con ese email', 400);
  if (existeBorrado) throw new AppError('Ya existe un usuario con ese email (aunque esté eliminado); usa otro correo', 400);

  let usuario;
  try {
    usuario = await Usuario.create({
      nombre: datos.nombre,
      email: datos.email,
      password: datos.password, // el pre('save') lo hashea con bcrypt
      rol: datos.rol,
      activo: true,
      permisos: {
        editar: datos.permisos?.editar ?? false,
        eliminar: datos.permisos?.eliminar ?? false,
      },
    });
  } catch (error) {
    if (error?.code === 11000) throw new AppError('Ya existe un usuario con ese email', 400);
    throw error;
  }

  await registrarAuditoria({
    entidad: 'usuarios',
    entidadId: String(usuario._id),
    accion: 'crear',
    despues: sinPassword(usuario),
    usuario: responsable,
  });
  return sinPassword(usuario);
}

// Actualiza rol y/o permisos (con auditoría antes/después).
export async function actualizar(id, datos, responsable, responsableId) {
  if (!isValidObjectId(id)) throw new AppError('Identificador de usuario no válido', 400);
  const usuario = await Usuario.findById(id);
  if (!usuario) throw new AppError('Usuario no encontrado', 404);

  // Un admin no puede quitarse el rol a sí mismo (evita quedar sin administradores).
  if (esMismoUsuario(id, responsableId) && datos.rol !== undefined && datos.rol !== usuario.rol) {
    throw new AppError('No puedes modificar tu propio rol; pide a otro administrador que lo haga', 400);
  }

  const antes = sinPassword(usuario);
  if (datos.rol !== undefined) usuario.rol = datos.rol;
  if (datos.permisos !== undefined) {
    usuario.permisos = {
      editar: datos.permisos.editar ?? false,
      eliminar: datos.permisos.eliminar ?? false,
    };
  }
  await usuario.save();

  await registrarAuditoria({
    entidad: 'usuarios',
    entidadId: String(id),
    accion: 'actualizar',
    antes,
    despues: sinPassword(usuario),
    usuario: responsable,
  });
  return sinPassword(usuario);
}

// Activa o desactiva la cuenta (un usuario desactivado no puede iniciar sesión).
export async function activarDesactivar(id, activo, responsable, responsableId) {
  if (!isValidObjectId(id)) throw new AppError('Identificador de usuario no válido', 400);
  const usuario = await Usuario.findById(id);
  if (!usuario) throw new AppError('Usuario no encontrado', 404);
  if (activo === false && esMismoUsuario(id, responsableId)) {
    throw new AppError('No puedes desactivar tu propia cuenta de administrador', 400);
  }

  const antes = sinPassword(usuario);
  usuario.activo = activo;
  await usuario.save();

  await registrarAuditoria({
    entidad: 'usuarios',
    entidadId: String(id),
    accion: activo ? 'activar' : 'desactivar',
    antes,
    despues: sinPassword(usuario),
    usuario: responsable,
  });
  return sinPassword(usuario);
}

// Borrado lógico: el usuario deja de aparecer y no puede iniciar sesión.
export async function eliminar(id, responsable, responsableId) {
  if (!isValidObjectId(id)) throw new AppError('Identificador de usuario no válido', 400);
  const usuario = await Usuario.findById(id);
  if (!usuario) throw new AppError('Usuario no encontrado', 404);
  if (esMismoUsuario(id, responsableId)) {
    throw new AppError('No puedes eliminar tu propia cuenta de administrador', 400);
  }

  const antes = sinPassword(usuario);
  await usuario.softDelete(responsable);
  await registrarAuditoria({
    entidad: 'usuarios',
    entidadId: String(id),
    accion: 'eliminar_logico',
    antes,
    despues: sinPassword(usuario),
    usuario: responsable,
  });
  return sinPassword(usuario);
}
