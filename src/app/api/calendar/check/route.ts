import { checkCalendarYear } from "@/lib/server/calendar-check";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const year = Number(new URL(request.url).searchParams.get("year"));
    return Response.json(await checkCalendarYear(year));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "检查失败" },
      { status: 400 },
    );
  }
}
