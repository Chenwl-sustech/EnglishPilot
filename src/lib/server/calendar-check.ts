import { official2026 } from "../calendar";
export async function checkCalendarYear(
  year: number,
  fetcher: typeof fetch = fetch,
) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    throw new Error("年份范围应为 2000–2200");
  const checkedAt = new Date().toISOString();
  if (year === 2026)
    return {
      year,
      checkedAt,
      status: "verified" as const,
      source: official2026.source,
      message: "2026 年安排已依据国务院办公厅通知核实，本地版本可离线读取。",
    };
  const source = `https://sousuo.www.gov.cn/sousuo/search.shtml?searchWord=${encodeURIComponent(`国务院办公厅关于${year}年部分节假日安排的通知`)}`;
  try {
    const response = await fetcher(source, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "EnglishPilot calendar verification" },
      cache: "no-store",
    });
    if (!response.ok)
      return {
        year,
        checkedAt,
        status: "error" as const,
        source,
        message: `官方检索暂不可用（HTTP ${response.status}）；未核实，继续使用普通星期规则。`,
      };
    const html = await response.text();
    const found = html.match(
      new RegExp(
        `href=["'](https://www\\.gov\\.cn/zhengce/[^"']+)["'][^>]*>[^<]*${year}年[^<]*节假日`,
      ),
    );
    return {
      year,
      checkedAt,
      status: found ? ("candidate" as const) : ("unverified" as const),
      source: found?.[1] ?? source,
      message: found
        ? "发现候选官方通知；尚未人工核实日期，不自动推断或替换日历。"
        : "尚未取得可核实的年度通知；这不等于断言官方未发布。继续使用星期规则，可在官方页面核对并手动调整。",
    };
  } catch {
    return {
      year,
      checkedAt,
      status: "error" as const,
      source,
      message:
        "官方年度检查超时或网络不可用；保留已核实日历，未知年份继续按星期规则。",
    };
  }
}
