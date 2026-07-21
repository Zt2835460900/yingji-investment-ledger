import { fetchLiveAshareHistory } from "@/lib/stock-data";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const requestedLimit = Number(url.searchParams.get("limit") ?? "120");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(20, Math.floor(requestedLimit)))
    : 120;
  try {
    const history = await fetchLiveAshareHistory(code, limit);
    return Response.json(history, {
      headers: { "Cache-Control": "private, max-age=45, stale-while-revalidate=60" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "股票历史行情读取失败",
      },
      { status: 400 },
    );
  }
}
