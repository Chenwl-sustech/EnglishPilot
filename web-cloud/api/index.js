import { accountWebResponse } from "../server/proxy.mjs";
export default async function handler(req, res) {
  try {
    const method = (req.method || "GET").toUpperCase();
    let body;
    if (method !== "GET" && method !== "HEAD") {
      if (req.body !== undefined)
        body =
          typeof req.body === "string" || Buffer.isBuffer(req.body)
            ? req.body
            : JSON.stringify(req.body);
      else {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 200000) throw Error("too large");
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      if (Buffer.byteLength(body) > 200000) throw Error("too large");
    }
    const headers = new Headers();
    for (const name of ["authorization", "content-type"])
      if (typeof req.headers[name] === "string")
        headers.set(name, req.headers[name]);
    const request = new Request(
      "https://account-web.local" + (req.url || "/"),
      { method, headers, ...(body === undefined ? {} : { body }) },
    );
    const response = await accountWebResponse(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.statusCode = 413;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "请求过大或格式无效" }));
  }
}
