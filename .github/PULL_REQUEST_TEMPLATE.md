<!-- PR para el proyecto del laboratorio (SENA — ADSO, ficha 3174193). -->
<!-- Recuerda: convención de commits en backend/docs/CONVENCIONES.md -->

## ¿Qué hace este cambio?

<!-- Describe el porqué (el qué se ve en el diff). Ej: "feat(usuarios): CRUD exclusivo del rol admin". -->

## Tipo de commit

- [ ] `feat` · [ ] `fix` · [ ] `docs` · [ ] `refactor` · [ ] `test` · [ ] `chore` · [ ] otro: ______

## ¿A dónde va este PR?

- [ ] `feature/xxx` → `developer`
- [ ] `developer` → `QA`
- [ ] `QA` → `master` (producción)
- [ ] `hotfix/xxx` → `master` (urgente; justificar abajo)

## Checklist

- [ ] El mensaje del(los) commit(s) cumple la convención `tipo(alcance): asunto` en español.
- [ ] `npm test` pasa en verde (53 comprobaciones).
- [ ] `npm run security` pasa en verde (35 comprobaciones).
- [ ] No expone datos internos en la API pública (observaciones, motivos internos, contraseñas).
- [ ] Los borrados son lógicos y los cambios quedan en auditorías.
- [ ] Actualicé `docs/api.md` si cambiaron endpoints, y el `README.md` si hace falta.
- [ ] No incluye archivos ajenos al cambio ni credenciales (`.env` nunca se sube).

## Notas para el revisor

<!-- Riesgo, pruebas manuales hechas, screenshots, etc. -->
