export async function withServerTiming<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[server-loader] ${label} ${(performance.now() - startedAt).toFixed(0)}ms`);
    }
  }
}
