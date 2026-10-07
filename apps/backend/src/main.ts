import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config/configuration';

async function bootstrap() {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  // Credentials are allowed, so the allowed origins are an explicit list rather
  // than a reflected one. An unlisted origin is refused outright, and a request
  // that is allowed still gets the exact configured value back.
  const allowed = new Set(config.corsOrigins);
  app.enableCors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowed.has(origin));
    },
  });

  app.enableShutdownHooks();

  // Render and every other PaaS that fronts the service with a proxy sends
  // `X-Forwarded-Proto: https` and `X-Forwarded-For`. Without this, Express
  // reports every request as coming from the proxy's own private address, so
  // the per-IP rate limits in `RateLimitGuard` collapse onto a single bucket and
  // one client can lock out every other client.
  //
  // One hop, not `true`: that is exactly the layout in front of the API on a
  // PaaS — one proxy appends the real client address to X-Forwarded-For and
  // everything further left (where a client can put whatever it likes) is
  // ignored. `true` would make that client-written part authoritative, and the
  // default `false` would put every user behind the proxy into the single
  // per-IP rate-limit bucket described above. `getInstance()` because Nest's
  // application type does not expose Express settings.
  const httpInstance = app.getHttpAdapter().getInstance();
  if (typeof httpInstance.set === 'function') httpInstance.set('trust proxy', 1);

  // `config.host`, not a bare `listen(port)`: a server bound to the default
  // loopback is unreachable through Render's proxy even though it started
  // without an error.
  await app.listen(config.port, config.host);
  const logger = new Logger('Bootstrap');
  logger.log(`ISOBASH API listening on ${config.host}:${config.port} (public URL ${config.apiUrl})`);
  logger.log(`Session cookie: SameSite=${config.cookie.sameSite} Secure=${config.cookie.secure}`);
  logger.log(`CORS origins: ${config.corsOrigins.join(', ') || '(none)'}`);
  logger.log(`Runtime data root: ${config.storage.dataRoot}`);
}
bootstrap();