import { z } from 'zod';

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const scenarioMetadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  suites: z.array(z.enum(['smoke', 'benchmark'])).min(1),
  track: z.enum(['apollo-cli', 'apollo-java-client']),
  products: z.array(z.string()).min(1),
  timeoutSec: z.number().int().positive().optional(),
});

const imageSchema = z.object({
  reference: z.string().min(1),
  id: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  repoDigests: z.array(z.string()),
  architecture: z.string().min(1),
  os: z.string().min(1),
});

export const lockSchema = z.object({
  generatedAt: z.string(),
  products: z.object({
    apollo: z.object({ version: z.string(), image: z.string() }),
    apolloJava: z.object({ version: z.string(), coordinates: z.string() }),
    apolloCli: z.object({ version: z.string(), releaseTag: z.string() }),
  }),
  runtime: z.object({
    dockerVersion: z.string(),
    apolloImage: imageSchema,
    javaRunnerImage: imageSchema,
  }),
  artifacts: z.object({
    apolloCli: z.object({
      path: z.string(),
      sha256: sha256Schema,
      target: z.string(),
      archiveUrl: z.string().url(),
      archiveSha256: sha256Schema,
    }),
    mavenRepo: z.object({
      path: z.string(),
      apolloClientJar: z.object({ path: z.string(), url: z.string().url(), sha256: sha256Schema }),
    }),
  }),
});

export type VersionsLock = z.infer<typeof lockSchema>;
