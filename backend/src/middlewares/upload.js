// Sube archivos con multer en memoria, con límite de tamaño y tipo (RNF-016).
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_MB * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
      return cb(new AppError('Tipo de archivo no permitido. Solo PDF, JPG y PNG.', 400));
    }
    cb(null, true);
  },
});

// Envuelve multer para devolver errores JSON claros en español.
export const subirArchivos = (campo, max = 3) => (req, res, next) => {
  upload.array(campo, max)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(`El archivo supera el límite de ${env.MAX_FILE_MB} MB`, 400));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError(`Máximo ${max} archivos por respuesta`, 400));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(`Máximo ${max} archivos por respuesta`, 400));
    }
    next(err);
  });
};
