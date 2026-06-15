/** Normalize fetch mock input — ky v2 passes Request objects, not URL strings. */
export function resolveFetchUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

export async function captureFetchCall(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<{ url: string; method: string; body?: string }> {
  if (input instanceof Request) {
    const request = input;
    let body: string | undefined;
    if (request.body) {
      body = await new Response(request.body).text();
    }
    return {
      url: request.url,
      method: request.method,
      body,
    };
  }
  return {
    url: String(input),
    method: init.method ?? "GET",
    body: init.body ? `${init.body}` : undefined,
  };
}
