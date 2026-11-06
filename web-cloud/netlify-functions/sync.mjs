import { syncGatewayResponse } from "../server/sync-proxy.mjs";

export default function (request) {
  return syncGatewayResponse(request);
}
export const config = { path: "/api/sync/*" };
