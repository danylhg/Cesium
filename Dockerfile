FROM node:20-alpine

# carpeta de trabajo dentro del contenedor
WORKDIR /app

# copiar package primero (mejor cache)
COPY Operaciones/api/package*.json ./

RUN npm install

# copiar el resto del código
COPY Operaciones/api ./

EXPOSE 3000

CMD ["node", "server.js"]