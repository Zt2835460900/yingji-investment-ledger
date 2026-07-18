export type MarketNewsCategory = "A股" | "海外市场" | "基金ETF" | "宏观";

export interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  source: string;
  url: string;
  category: MarketNewsCategory;
}

export interface MarketNewsFeed {
  items: MarketNewsItem[];
  updatedAt: string;
  source: string;
  isLive: boolean;
  isToday: boolean;
  message: string;
}

interface EastmoneyNewsItem {
  code?: string;
  title?: string;
  summary?: string;
  showTime?: string;
  mediaName?: string;
  uniqueUrl?: string;
  url?: string;
}

interface EastmoneyNewsResponse {
  code?: string | number;
  data?: {
    list?: EastmoneyNewsItem[];
  };
}

let cache: { expiresAt: number; feed: MarketNewsFeed } | null = null;

export function classifyMarketNews(
  title: string,
  summary = "",
): MarketNewsCategory {
  const text = `${title}${summary}`;
  if (/ETF|基金|QDII|公募|私募|定投/i.test(text)) return "基金ETF";
  if (
    /美股|纳指|标普|道指|华尔街|美联储|英伟达|特斯拉|美元|国际油价|全球市场|港股|恒生|日经|欧洲股市/i.test(
      text,
    )
  )
    return "海外市场";
  if (
    /A股|沪深|上证|深证|创业板|科创板|两融|涨停|跌停|券商|上市公司|北向资金|股票/i.test(
      text,
    )
  )
    return "A股";
  return "宏观";
}

function chinaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return "";
  return value.replace(/^http:\/\//i, "https://");
}

function trimSummary(value: string) {
  const plain = value
    .replace(/<[^>]+>/g, "")
    .replace(/^【[^】]+】/, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 128 ? `${plain.slice(0, 128)}…` : plain;
}

export async function fetchMarketNews(force = false): Promise<MarketNewsFeed> {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) return cache.feed;

  const reqTrace = `${now}-${Math.random().toString(16).slice(2)}`;
  const endpoint = new URL(
    "https://np-listapi.eastmoney.com/comm/web/getNewsByColumns",
  );
  endpoint.search = new URLSearchParams({
    client: "web",
    biz: "web_news_col",
    column: "345",
    order: "1",
    needInteractData: "0",
    page_index: "1",
    page_size: "24",
    req_trace: reqTrace,
  }).toString();

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        Referer: "https://finance.eastmoney.com/",
        "User-Agent": "YingjiPortfolio/1.0",
      },
    });
    if (!response.ok) throw new Error(`新闻源返回 ${response.status}`);
    const payload = (await response.json()) as EastmoneyNewsResponse;
    const rawItems = payload.data?.list ?? [];
    const items = rawItems
      .map((item): MarketNewsItem | null => {
        const title = String(item.title ?? "").trim();
        const url = normalizeUrl(String(item.uniqueUrl ?? item.url ?? ""));
        if (!title || !url) return null;
        const summary = trimSummary(String(item.summary ?? ""));
        return {
          id: String(item.code ?? `${item.showTime}-${title}`),
          title,
          summary,
          publishedAt: String(item.showTime ?? ""),
          source: String(item.mediaName ?? "东方财富网"),
          url,
          category: classifyMarketNews(title, summary),
        };
      })
      .filter((item): item is MarketNewsItem => Boolean(item));

    if (!items.length) throw new Error("新闻源暂时没有返回内容");
    const today = chinaDate();
    const todayItems = items.filter((item) =>
      item.publishedAt.startsWith(today),
    );
    const isToday = todayItems.length > 0;
    const selected = (isToday ? todayItems : items).slice(0, 12);
    const feed: MarketNewsFeed = {
      items: selected,
      updatedAt: new Date().toISOString(),
      source: "东方财富网财经导读",
      isLive: true,
      isToday,
      message: isToday
        ? `已自动获取 ${today} 市场资讯`
        : "今日暂无新稿，显示最近市场资讯",
    };
    cache = { expiresAt: now + 5 * 60 * 1000, feed };
    return feed;
  } catch (error) {
    if (cache) {
      return {
        ...cache.feed,
        isLive: false,
        message: "实时新闻源暂时不可用，显示最近一次缓存",
      };
    }
    return {
      items: [],
      updatedAt: new Date().toISOString(),
      source: "东方财富网财经导读",
      isLive: false,
      isToday: false,
      message: error instanceof Error ? error.message : "新闻源暂时不可用",
    };
  }
}
