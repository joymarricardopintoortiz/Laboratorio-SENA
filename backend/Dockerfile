# Imagen de producción del backend del laboratorio (SENA — ADSO, ficha 3174193).
#
# Los secretos (MONGODB_URI, JWT_SECRET, MAIL_*, ADMIN_*) NUNCA van dentro de
# la imagen: se inyectan en tiempo de ejecución con `env_file: .env` (compose)
# o con `-e` (docker run). Ver .dockerignore: tampoco entran .env ni node_modules.
FROM node:22-alpine

WORKDIR /app

# Capa de dependidades: solo se reconstruye si cambia package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código de producción únicamente (src/ + scripts/ de utilidad: seed, backup...).
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Salud del contenedor: sano solo si /api/health responde y la base dice
# "conectada" (si Atlas no responde, Docker marca el contenedor como unhealthy).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>r.json()).then(d=>process.exit(d.ok&&d.baseDatos==='conectada'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
