import "reflect-metadata";
import cors from "@fastify/cors";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 3000);

  await app.listen(port, "0.0.0.0");
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
