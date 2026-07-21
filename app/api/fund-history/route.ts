import { fetchFundNavHistory } from "@/lib/fund-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!/^\d{6}$/.test(code))
    return Response.json(
      { error: "请输入 6 位基金或 ETF 代码" },
      { status: 400 },
    );

  try {
    return Response.json(await fetchFundNavHistory(code), {
      headers: {
        "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "历史净值读取失败",
      },
      { status: 502 },
    );
  }
}
