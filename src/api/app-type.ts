import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/** FastifyInstance with the Zod type provider, shared by route modules. */
export type ApiApp = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;
