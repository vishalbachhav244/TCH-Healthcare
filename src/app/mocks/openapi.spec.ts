/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('OpenAPI document', () => {
  it('declares unique operations and resolves its internal references', () => {
    const contract = parse(readFileSync('docs/openapi.yaml', 'utf8')) as Record<string, unknown>;
    const paths = contract['paths'] as Record<string, Record<string, { operationId: string }>>;
    const ids = Object.values(paths).flatMap((path) =>
      Object.values(path).map((operation) => operation.operationId),
    );
    expect(contract['openapi']).toBe('3.1.0');
    expect(ids).toContain('getQueueDisplay');
    expect(ids).toContain('advanceLabOrder');
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of JSON.stringify(contract).matchAll(/"\$ref":"(#\/[^"]+)"/g)) {
      const target = match[1]
        .slice(2)
        .split('/')
        .reduce<unknown>(
          (node, key) =>
            typeof node === 'object' && node !== null
              ? (node as Record<string, unknown>)[key]
              : undefined,
          contract,
        );
      expect(target, match[1]).toBeDefined();
    }
  });
});
