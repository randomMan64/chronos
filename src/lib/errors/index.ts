export class AppError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function handleApiError(error: unknown): {
  status: number;
  body: { error: string; code?: string; details?: unknown };
} {
  console.error("[CHRONOS_API_ERROR]", error);

  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: { error: error.message, details: error.details },
    };
  }

  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const custom = error as { statusCode: number; message: string };
    return {
      status: custom.statusCode || 500,
      body: { error: custom.message || "An unexpected error occurred" },
    };
  }

  const message = error instanceof Error ? error.message : "An internal server error occurred";
  return {
    status: 500,
    body: { error: message },
  };
}

