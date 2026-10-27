import { accountWebResponse } from "../server/proxy.mjs";

/** Leave time to return JSON before Netlify's 60-second synchronous limit. */
export default async function (request) {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 55000);
  try {
    return await accountWebResponse(request, process.env, (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          deadline.signal,
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}
export const config = {
  path: [
    "/api/evaluate",
    "/api/teacher",
    "/api/configuration",
    "/api/ai-usage",
  ],
};
