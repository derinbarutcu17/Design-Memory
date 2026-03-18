const FIGMA_API_BASE = "https://api.figma.com/v1";

export class FigmaSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FigmaSyncError";
  }
}

function getFigmaAccessToken() {
  const token = process.env.FIGMA_ACCESS_TOKEN;

  if (!token) {
    throw new FigmaSyncError(
      "Missing FIGMA_ACCESS_TOKEN. Add it to your environment before syncing from Figma.",
    );
  }

  return token;
}

export async function figmaGet<T>(pathname: string) {
  const response = await fetch(`${FIGMA_API_BASE}${pathname}`, {
    headers: {
      "X-Figma-Token": getFigmaAccessToken(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = response.statusText;

    try {
      const body = (await response.json()) as { err?: string; message?: string };
      detail = body.err ?? body.message ?? detail;
    } catch {
      // Keep the HTTP status text when the error body is not JSON.
    }

    if (response.status === 404) {
      throw new FigmaSyncError("Figma file not found. Check the file key and token access.");
    }

    if (response.status === 403 || response.status === 401) {
      throw new FigmaSyncError(
        "Figma rejected the request. Check FIGMA_ACCESS_TOKEN and file permissions.",
      );
    }

    throw new FigmaSyncError(`Figma sync failed: ${detail}`);
  }

  return (await response.json()) as T;
}
