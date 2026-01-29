import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { captureException, initObservability } from "./observability.js";
import { env } from "./config/env.js";

// Rotas
import { opsRoutes } from "./routes/ops.routes.js";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhook.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { conversationsRoutes } from "./routes/conversations.routes.js";
import { contactsRoutes } from "./routes/contacts.routes.js";
import { reportsRoutes } from "./routes/reports.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { miscRoutes } from "./routes/misc.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { reactionsRoutes } from "./routes/reactions.routes.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

// Inicializar Observabilidade
initObservability({
  NODE_ENV: env.NODE_ENV,
  SERVICE_NAME: "crmolifant-api",
  OTEL_ENABLED: env.OTEL_ENABLED,
  OTEL_EXPORTER_OTLP_ENDPOINT: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  SENTRY_DSN: env.SENTRY_DSN
});

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    },
    bodyLimit: 50 * 1024 * 1024 // 50MB para permitir upload de arquivos grandes via Base64
  });

  // Middlewares Globais
  // CORS deve vir ANTES do Helmet
  await app.register(cors, {
    origin: (origin, cb) => {
      // Permitir requests sem origin (como curl, Postman, etc)
      if (!origin) {
        cb(null, true);
        return;
      }
      
      // Lista de origens permitidas
      const allowedOrigins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        env.WEB_ORIGIN
      ].filter(Boolean);
      
      // Verificar se a origem está na lista
      if (allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
  
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });

  // Rate limit agressivo apenas no webhook (proteção contra abuso/picos).
  await app.register(rateLimit, {
    global: false
  });

  // Capturar raw body (necessário para validar assinatura da Meta).
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, function (req, body, done) {
    req.rawBody = body as Buffer;
    try {
      // Se body estiver vazio, retornar objeto vazio
      if (!body || body.length === 0) {
        done(null, {});
        return;
      }
      const json = JSON.parse(body.toString("utf8"));
      done(null, json);
    } catch (err) {
      // Se houver erro de parse, retornar objeto vazio ao invés de falhar
      console.warn("Aviso: Erro ao parsear JSON body:", err);
      done(null, {});
    }
  });

  // Hooks Globais
  app.addHook("onError", async (_req, _reply, err) => {
    captureException(err);
  });

  // Registrar Rotas
  await app.register(opsRoutes);
  await app.register(whatsappWebhookRoutes);
  await app.register(usersRoutes);
  await app.register(conversationsRoutes);
  await app.register(contactsRoutes);
  await app.register(reportsRoutes);
  await app.register(adminRoutes);
  await app.register(miscRoutes);
  await app.register(settingsRoutes);
  await app.register(reactionsRoutes);

  return app;
}

// Iniciar servidor quando executado diretamente
(async () => {
  try {
    const app = await buildServer();
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`🚀 API rodando em http://localhost:${env.PORT}`);
    console.log(`📡 Endpoints disponíveis em http://localhost:${env.PORT}/api`);
    console.log(`✅ Health check: http://localhost:${env.PORT}/health`);
  } catch (err) {
    console.error("❌ Erro ao iniciar API:", err);
    process.exit(1);
  }
})();
