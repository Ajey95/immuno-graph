FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY data ./data
RUN npm run build

FROM node:22-alpine
LABEL io.modelcontextprotocol.server.name="io.github.Ajey95/immunograph"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
USER node
EXPOSE 3000
CMD ["node", "dist/http.js"]
