import { NextResponse, type NextRequest } from "next/server";
import { webAccessResponse } from "./lib/server/web-access";
export function proxy(request: NextRequest) {
  return webAccessResponse(request) ?? NextResponse.next();
}
