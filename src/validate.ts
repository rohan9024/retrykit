export interface StandardSchema<T = unknown> {
  '~standard': {
    validate: (value: unknown) => unknown | Promise<unknown>;
  };
}

export async function retryWithValidation<T>(operation: () => Promise<unknown>, schema: StandardSchema<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      const validation = await schema['~standard'].validate(result);
      if (validation && typeof validation === 'object' && 'issues' in validation && (validation as any).issues) {
        throw new Error('Standard Schema validation failed');
      }
      return ((validation as any)?.value ?? validation ?? result) as T;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
