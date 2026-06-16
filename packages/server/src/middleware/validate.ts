import type { Context } from 'hono';
import type { z } from 'zod';

/** Normalizes Zod issues into a stable API error shape for clients and tests. */
function formatZodError(error: z.ZodError): {
  error: string;
  details: Array<{ field: string; message: string }>;
} {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Parses a JSON request body and validates it with Zod.
 * Returns an error response instead of throwing on malformed JSON or schema failures.
 */
export async function parseAndValidate<T extends z.ZodType>(
  c: Context,
  schema: T
): Promise<{ success: true; data: z.output<T> } | { success: false; response: Response }> {
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
