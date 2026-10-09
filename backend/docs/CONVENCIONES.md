# Convenciones del proyecto — ramas, commits y despliegues

Guía de trabajo en equipo para el backend del **Sistema de Gestión para el Servicio de Análisis de Laboratorio** (SENA — ADSO, ficha 3174193). Repo: `joymarricardopintoortiz/Laboratorio-SENA`.

---

## 1. Ramas

```
master          → producción ("lo que está en funcionamiento"); protegida
 ├── QA         → pruebas / integración; candidato a despliegue de staging
 │    └── developer   → trabajo diario del equipo
```

| Rama | Para qué sirve | Quién commitea | Cuándo avanza |
|---|---|---|---|
| `developer` | Desarrollo diario. Todo nace acá. | Cualquier integrante (desde ramas `feature/` o `fix/`) | Cuando se aprueba un PR de `feature/*` |
| `QA` | Integración y pruebas contra el entorno de staging. | Solo mediante PR desde `developer` | Cuando las pruebas pasan y el equipo da el visto bueno |
| `master` | Producción. Solo código probado en QA. | Solo mediante PR desde `QA` | Cada vez que se libera a producción |

**Reglas de oro:**
1. **Nunca** se commitea directo en `master` ni en `QA` (excepción: `hotfix/*`).
2. `master` solo avanza con un PR aprobado desde `QA`.
3. Antes de abrir un PR se hace *pull* de la rama destino y los conflictos se resuelven **siempre en la rama origen** (nunca en `master`).

### Ramas auxiliares

| Patrón | Uso | Ejemplo |
|---|---|---|
| `feature/<nombre>` | Nueva funcionalidad; nace y muere en `developer`. | `feature/gestion-usuarios` |
| `fix/<nombre>` | Corrección de un bug conocido. | `fix/filtro-auditorias` |
| `hotfix/<nombre>` | Corrección urgente en producción; nace en `master`. | `hotfix/login-500` |

Se eliminan al mergear (GitHub las borra automáticamente con *"Automatically delete head branches"*).

---

## 2. Flujo de trabajo

### 2.1 Ciclo normal

```bash
git checkout developer && git pull
git checkout -b feature/<nombre>      # o fix/<nombre>
# ... trabajar y commitear con la convención de la sección 3 ...
npm test && npm run security          # verde antes de abrir el PR
```

1. PR `feature/<nombre>` → `developer` (1 revisión).
2. PR `developer` → `QA` (pruebas en staging).
3. PR `QA` → `master` (liberación a producción).
4. Tag `vX.Y.Z` en `master` (sección 5).

### 2.2 Hotfix de producción

```bash
git checkout master && git pull
git checkout -b hotfix/<nombre>
# corregir, commitear con la convención, npm test
```

1. PR `hotfix/<nombre>` → `master` (aprobación exprés).
2. PR `hotfix/<nombre>` → `QA`.
3. PR `hotfix/<nombre>` → `developer` (para que el fix no se pierda).

---

## 3. Convención de Commits

### 3.1 Formato

```
tipo(alcance): asunto

[cuerpo opcional: el porqué del cambio]

[footer opcional: Closes #12]
```

- Asunto en **español**, en **imperativo** ("agrega", no "agregó"), sin punto final, en minúsculas, ≤ 72 caracteres.
- **Alcance**: módulo en minúsculas (`usuarios`, `publico`, `muestras`, `api`, `env`, `smoke`, `readme`…). Si aplica a todo el proyecto, se omite.
- **Cuerpo**: explica **por qué** (el *qué* se ve en el diff). Recomendado en cambios de seguridad o de comportamiento.
- **Footer**: `Closes #<número>` al cerrar un issue; `BREAKING CHANGE:` si rompe compatibilidad.

### 3.2 Tipos permitidos

| Tipo | Cuándo usarlo | Ejemplo |
|---|---|---|
| `feat` | Nueva funcionalidad | `feat(usuarios): CRUD exclusivo del rol admin con auditoría` |
| `fix` | Corrección de error o fuga | `fix(publico): el motivo interno ya no se filtra en /seguimiento` |
| `docs` | Solo documentación | `docs(api): documentar usuarios y auditorías (96 rutas)` |
| `refactor` | Reestructurar sin cambiar comportamiento | `refactor(auditorias): validar filtros de query en el controller` |
| `test` | Pruebas | `test(smoke): cubrir login del encargado y bloqueo 403` |
| `chore` | Tareas sin impacto funcional | `chore(env): agregar TRUST_PROXY al .env.example` |
| `build` | Scripts npm, dependencias | `build(npm): scripts de backup y restore` |
| `ci` | Integración continua | `ci(github): verificar npm test en PR a developer` |
| `perf` | Rendimiento comprobable | `perf(publico): una sola consulta para informe y facturación` |
| `revert` | Revertir un commit | `revert(feat(usuarios)): deshacer cambio de permisos` |

**Prohibido:** `alpha v9`, `update`, `cambios`, `WIP`, mensajes vacíos, mayúsculas y punto al final del asunto. Tampoco se mezclan en un commit una funcionalidad grande con correcciones ajenas.

### 3.3 Tamaño de los commits

- **Un commit = un cambio coherente** (una funcionalidad pequeña o una corrección).
- Cambios grandes: partirlos en commits encadenados (`feat(x): modelo y servicio`, luego `feat(x): rutas y schema`, luego `test(x): humo`).

---

## 4. Protección de ramas en GitHub

*(Settings → Branches → Add branch protection rule; lo configura el administrador del repo)*

| Regla | `master` | `QA` |
|---|---|---|
| Require a pull request before merging | ✅ | ✅ |
| Require approvals | 1 (responsable del proyecto) | 1 |
| Dismiss stale approvals | ✅ | ✅ |
| Do not allow bypassing the settings | ✅ | ✅ |
| Restrict deletions / force pushes | ✅ | ✅ |

Y en *Settings → General → Pull Requests*: **Automatically delete head branches**.

---

## 5. Versionado semántico `vMAJOR.MINOR.PATCH`

| Dígito | Cambia cuando… |
|---|---|
| `MAJOR` | Rompe compatibilidad de la API (formatos de respuesta, endpoints eliminados) |
| `MINOR` | Nuevas funcionalidades (`feat`) compatibles |
| `PATCH` | Correcciones (`fix`, `docs`, `refactor`) compatibles |

**Liberación (cada merge `QA` → `master`):**
1. Actualizar `"version"` en `backend/package.json`.
2. Commit en `master` vía PR: `chore(release): v1.1.0`.
3. `git tag v1.1.0 && git push origin v1.1.0`.

> El historial `alpha v1..v8` cuenta como `v0.x`; el primer release formal es **`v1.0.0`**.

---

## 6. Entornos y variables de entorno

| Rama | Entorno | Base de datos |
|---|---|---|
| `master` | Producción | base `laboratorio` (Atlas) |
| `QA` | Staging | base `laboratorio_qa` (Atlas) |
| `developer` | Desarrollo local | base `laboratorio_dev` |

Cada entorno tiene **su propio** `.env`/configuración en la plataforma: `MONGODB_URI`, `JWT_SECRET` (≥32 caracteres), `TRUST_PROXY=1`, `FRONTEND_URL`, `ADMIN_*` y `MAIL_*` **distintos por entorno**. Los secrets jamás se escriben en el repo ni en commits (solo `.env` ignorado; `.env.example` sin valores reales).

**Despliegue (cuando se elija la plataforma):** servicio apuntando a `backend/`, inicio `npm start`, health check en `/api/health`; `master` ⇒ producción automática, `QA` ⇒ staging automático. Reversión: redeploy del tag anterior + `hotfix/*`.

---

## 7. Integración continua (pendiente)

Cuando se defina la plataforma, crear `.github/workflows/ci.yml`: en PR a `developer` y `QA`, correr `npm ci` → `npm test` → `npm run security` usando una base `laboratorio_ci` guardada como *secret* del repo (nunca la de producción). Después marcarlo como *required status check* en la protección de ramas.

---

## 8. Regla de oro final

> Si dudas si un commit cumple la convención: léelo en voz alta como una frase que completa **"Este commit ..."**. Si no la completa con claridad, reescríbelo antes de hacer *push*.
