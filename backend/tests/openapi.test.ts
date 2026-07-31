import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

interface OpenApiOperation {
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses: Record<
    string,
    {
      content?: Record<string, { schema?: Record<string, unknown> }>;
    }
  >;
}

interface OpenApiDocument {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const document = JSON.parse(
  fs.readFileSync(path.resolve('openapi.json'), 'utf-8'),
) as OpenApiDocument;

describe('generated OpenAPI contract', () => {
  it('uses a valid dialect while preserving the WIP API version', () => {
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.version).toBe('1.0.0');
  });

  it('documents logout and refresh cookie authentication', () => {
    expect(document.paths['/api/auth/logout']?.post.responses['204']).toBeDefined();
    expect(document.paths['/api/auth/logout']?.post.security).toEqual([]);
    expect(document.paths['/api/auth/refresh']?.post.security).toEqual([{ refreshCookie: [] }]);
    expect(document.paths['/api/auth/refresh']?.post.requestBody).toBeUndefined();
    expect(JSON.stringify(document.paths['/api/auth/refresh']?.post.responses)).not.toContain(
      'refreshToken',
    );
  });

  it('documents the actual MC ticket request and both authentication headers', () => {
    const operation = document.paths['/api/mc/tickets']?.post;
    const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
    const properties = requestSchema?.properties as Record<string, unknown> | undefined;

    expect(operation.security).toEqual([{ apiKey: [], minecraftPlayerSession: [] }]);
    expect(properties).toHaveProperty('body');
    expect(properties).toHaveProperty('context');
    expect(properties).not.toHaveProperty('gameContext');
  });

  it('describes successful JSON responses with the standard envelope', () => {
    const responseSchema =
      document.paths['/api/admin/storage/test']?.post.responses[200].content?.['application/json']
        ?.schema;
    const required = responseSchema?.required as string[] | undefined;

    expect(responseSchema?.properties).toHaveProperty('success');
    expect(responseSchema?.properties).toHaveProperty('data');
    expect(required).toEqual(expect.arrayContaining(['success', 'data']));
  });

  it('documents attachment uploads as validated multipart form data', () => {
    const operation = document.paths['/api/attachments/upload']?.post;
    const requestSchema = operation.requestBody?.content?.['multipart/form-data']?.schema;
    const properties = requestSchema?.properties as Record<string, unknown> | undefined;

    expect(operation.requestBody?.content?.['application/json']).toBeUndefined();
    expect(properties).toHaveProperty('file');
    expect(properties).toHaveProperty('ticketId');
    expect(properties).toHaveProperty('commentId');
  });

  it('documents configurable attachment quota and expiration in admin settings', () => {
    const patchOperation = document.paths['/api/setup/settings']?.patch;
    const requestSchema = patchOperation.requestBody?.content?.['application/json']?.schema;
    const requestProperties = requestSchema?.properties as Record<string, unknown> | undefined;
    const responseSchema = patchOperation.responses[200].content?.['application/json']?.schema
      ?.properties as Record<string, { properties?: Record<string, unknown> }> | undefined;
    const dataProperties = responseSchema?.data?.properties;

    expect(requestProperties).toHaveProperty('attachment');
    expect(dataProperties).toHaveProperty('attachment');
    expect(dataProperties).toHaveProperty('attachmentDefaults');
  });
});
