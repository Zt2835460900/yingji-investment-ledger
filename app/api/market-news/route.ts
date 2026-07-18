import { fetchMarketNews } from "@/lib/market-news";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  return Response.json(await fetchMarketNews(force), {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=240",
    },
  });
}
