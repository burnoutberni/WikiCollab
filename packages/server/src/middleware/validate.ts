import type { Context } from 'hono';
import { type ZodSchema, type ZodError } from 'zod';

function formatZodError(error: ZodError): { error: string; details: Array<{ field: string; message: string }> } {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue: { path: (string | number)[]; message: string }) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export async function parseAndValidate<T>(c: Context, schema: ZodSchema<T>): Promise<
  | { success: true; data: T }
  | { success: false; response: Response }
> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return {
      success: false,
      response: c.json({ error: 'Invalid JSON in request body' }, 400),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: c.json(formatZodError(result.error), 400),
    };
  }

  return { success: true, data: result.data };
}
