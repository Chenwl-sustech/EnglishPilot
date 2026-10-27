import { accountWebResponse } from "../server/proxy.mjs";
export default { fetch: (request) => accountWebResponse(request) };
