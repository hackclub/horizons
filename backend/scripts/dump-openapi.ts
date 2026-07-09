// Dump the OpenAPI document to a JSON file without starting the HTTP server
// (and without needing a reachable database — onModuleInit hooks never run).
// Usage: npx ts-node -T scripts/dump-openapi.ts <output.json>
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { AppModule } from '../src/app.module';
import metadata from '../src/metadata';

async function main() {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error('Usage: ts-node scripts/dump-openapi.ts <output.json>');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { logger: false });

  await SwaggerModule.loadPluginMetadata(metadata);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Horizon API')
    .setDescription('The Horizon API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI document written to ${outPath}`);
  // Services hold open handles (schedulers, clients) — exit hard.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
