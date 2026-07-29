"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Layers3,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculateBuyOnlyTopUp,
  projectLongTermDca,
  simulateDcaVsLumpSum,
  type DcaComparisonResult,
  type LongTermDcaProjection,
} from "@/lib/investment-planning";

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

interface SeriesPoint {
  date: string;
  assets: number;
  contributions: number;
  profit: number;
}

export function ProfitCalendar({ series }: { series: SeriesPoint[] }) {
  const days = useMemo(
    () =>
      series.map((point, index) => ({
        ...point,
        dailyProfit: point.profit - (index > 0 ? series[index - 1].profit : 0),
      })),
    [series],
  );
  const months = useMemo(
    () => [...new Set(days.map((item) => item.date.slice(0, 7)))].sort(),
    [days],
  );
  const [month, setMonth] = useState(() => months.at(-1) ?? "");
  const activeMonth = months.includes(month) ? month : (months.at(-1) ?? "");
  const [selectedDate, setSelectedDate] = useState("");
  const monthIndex = months.indexOf(activeMonth);
  const [yearText, monthText] = activeMonth.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const dayCount =
    year && monthNumber ? new Date(year, monthNumber, 0).getDate() : 0;
  const firstWeekday =
    year && monthNumber
      ? (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7
      : 0;
  const monthDays = days.filter((item) => item.date.startsWith(activeMonth));
  const dayMap = new Map(monthDays.map((item) => [item.date, item]));
  const maxMove = Math.max(
    1,
    ...monthDays.map((item) => Math.abs(item.dailyProfit)),
  );
  const selected = dayMap.get(selectedDate) ?? monthDays.at(-1);
  const monthProfit = monthDays.reduce(
    (sum, item) => sum + item.dailyProfit,
    0,
  );
  const positiveDays = monthDays.filter((item) => item.dailyProfit > 0).length;
  const negativeDays = monthDays.filter((item) => item.dailyProfit < 0).length;

  return (
    <section className="panel profit-calendar-panel">
      <div className="feature-panel-head">
        <div>
          <span className="feature-kicker">
            <CalendarDays size={16} /> 盈亏日历
          </span>
          <h2>每天赚了多少，一眼看清</h2>
          <p>按相邻估值日的累计收益变化计算；无净值的日期不会伪造数据。</p>
        </div>
        <div className="calendar-switcher">
          <button
            aria-label="上一个月"
            disabled={monthIndex <= 0}
            onClick={() => setMonth(months[monthIndex - 1] ?? activeMonth)}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>{activeMonth || "暂无数据"}</strong>
          <button
            aria-label="下一个月"
            disabled={monthIndex < 0 || monthIndex >= months.length - 1}
            onClick={() => setMonth(months[monthIndex + 1] ?? activeMonth)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="calendar-summary">
        <div>
          <span>本月盈亏</span>
          <strong className={monthProfit >= 0 ? "up" : "down"}>
            {monthProfit >= 0 ? "+" : ""}¥{money(monthProfit)}
          </strong>
        </div>
        <div>
          <span>盈利估值日</span>
          <strong className="up">{positiveDays} 天</strong>
        </div>
        <div>
          <span>亏损估值日</span>
          <strong className="down">{negativeDays} 天</strong>
        </div>
        <div>
          <span>有数据日期</span>
          <strong>{monthDays.length} 天</strong>
        </div>
      </div>
      <div className="profit-calendar">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <span className="calendar-weekday" key={day}>
            {day}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span className="calendar-empty" key={`empty-${index}`} />
        ))}
        {Array.from({ length: dayCount }, (_, index) => {
          const day = index + 1;
          const date = `${activeMonth}-${String(day).padStart(2, "0")}`;
          const item = dayMap.get(date);
          const intensity = item
            ? 0.1 + (Math.abs(item.dailyProfit) / maxMove) * 0.45
            : 0;
          return (
            <button
              key={date}
              className={`${item ? (item.dailyProfit >= 0 ? "profit" : "loss") : "no-data"} ${selected?.date === date ? "selected" : ""}`}
              style={
                item
                  ? ({ "--day-alpha": intensity } as React.CSSProperties)
                  : undefined
              }
              disabled={!item}
              onClick={() => setSelectedDate(date)}
            >
              <span>{day}</span>
              <strong>
                {item
                  ? `${item.dailyProfit >= 0 ? "+" : ""}${Math.round(item.dailyProfit)}`
                  : ""}
              </strong>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="calendar-detail">
          <div>
            <span>{selected.date} 当日盈亏</span>
            <strong className={selected.dailyProfit >= 0 ? "up" : "down"}>
              {selected.dailyProfit >= 0 ? "+" : ""}¥
              {money(selected.dailyProfit)}
            </strong>
          </div>
          <div>
            <span>当日总资产</span>
            <strong>¥{money(selected.assets)}</strong>
          </div>
          <div>
            <span>累计收益</span>
            <strong className={selected.profit >= 0 ? "up" : "down"}>
              {selected.profit >= 0 ? "+" : ""}¥{money(selected.profit)}
            </strong>
          </div>
        </div>
      )}
    </section>
  );
}

export interface JournalEntry {
  id: number;
  account_id: number | null;
  instrument_id: number | null;
  entry_date: string;
  title: string;
  decision: string;
  mood: string;
  thesis: string;
  review_date: string;
  review_note: string;
  account_name: string | null;
  instrument_name: string | null;
  instrument_code: string | null;
}

interface JournalForm {
  accountId: string;
  instrumentId: string;
  instrumentCode: string;
  preferredProductType: "AUTO" | "FUND" | "STOCK";
  entryDate: string;
  title: string;
  decision: string;
  mood: string;
  thesis: string;
  reviewDate: string;
  reviewNote: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyJournal = (): JournalForm => ({
  accountId: "",
  instrumentId: "",
  instrumentCode: "",
  preferredProductType: "AUTO",
  entryDate: today(),
  title: "",
  decision: "REVIEW",
  mood: "CALM",
  thesis: "",
  reviewDate: "",
  reviewNote: "",
});
const decisionLabels: Record<string, string> = {
  BUY: "买入",
  HOLD: "持有",
  SELL: "卖出",
  WATCH: "观察",
  REVIEW: "复盘",
};
const moodLabels: Record<string, string> = {
  CALM: "平静",
  CONFIDENT: "有信心",
  ANXIOUS: "焦虑",
  FOMO: "怕错过",
};

interface JournalInstrument {
  id: number;
  name: string;
  code: string;
  market: string;
  asset_class: string;
  product_type: string;
}

const journalProductLabel = (instrument: JournalInstrument) =>
  instrument.product_type === "STOCK"
    ? "股票"
    : instrument.product_type === "ETF"
      ? "ETF"
      : "基金";

const journalCodeMatches = (
  instrument: JournalInstrument,
  codeInput: string,
  preference: JournalForm["preferredProductType"],
) => {
  if (preference === "STOCK" && instrument.product_type !== "STOCK")
    return false;
  if (
    preference === "FUND" &&
    !["FUND", "ETF"].includes(instrument.product_type)
  )
    return false;
  const code = codeInput.trim().toUpperCase();
  const storedCode = instrument.code.toUpperCase();
  if (storedCode === code) return true;
  if (instrument.product_type !== "STOCK") return false;
  const prefixed = code.match(/^(SH|SZ)(\d{6})$/);
  const suffixed = code.match(/^(\d{6})\.(SH|SZ)$/);
  if (prefixed) return storedCode === `${prefixed[1]}${prefixed[2]}`;
  if (suffixed) return storedCode === `${suffixed[2]}${suffixed[1]}`;
  return /^\d{6}$/.test(code) && storedCode.replace(/^(SH|SZ)/, "") === code;
};

export function JournalPanel({
  entries,
  accounts,
  instruments,
  busy,
  error,
  submit,
}: {
  entries: JournalEntry[];
  accounts: Array<{ id: number; name: string }>;
  instruments: JournalInstrument[];
  busy: boolean;
  error: string;
  submit: (
    payload: Record<string, unknown>,
    success?: string,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<JournalEntry | "new" | null>(null);
  const [form, setForm] = useState<JournalForm>(emptyJournal);
  const [journalLookupBusy, setJournalLookupBusy] = useState(false);
  const [journalLookupNote, setJournalLookupNote] = useState("");
  const [journalMatched, setJournalMatched] =
    useState<JournalInstrument | null>(null);
  const openNew = () => {
    setForm(emptyJournal());
    setJournalMatched(null);
    setJournalLookupNote("");
    setEditing("new");
  };
  const openEdit = (entry: JournalEntry) => {
    const instrument = instruments.find(
      (item) => item.id === entry.instrument_id,
    );
    setForm({
      accountId: entry.account_id ? String(entry.account_id) : "",
      instrumentId: entry.instrument_id ? String(entry.instrument_id) : "",
      instrumentCode: instrument?.code ?? entry.instrument_code ?? "",
      preferredProductType:
        instrument?.product_type === "STOCK" ? "STOCK" : "FUND",
      entryDate: entry.entry_date,
      title: entry.title,
      decision: entry.decision,
      mood: entry.mood,
      thesis: entry.thesis,
      reviewDate: entry.review_date,
      reviewNote: entry.review_note,
    });
    setJournalMatched(instrument ?? null);
    setJournalLookupNote(
      instrument
        ? `已关联：${instrument.name} · ${journalProductLabel(instrument)} · ${instrument.asset_class}`
        : "",
    );
    setEditing(entry);
  };
  const lookupJournalInstrument = async () => {
    const code = form.instrumentCode.trim().toUpperCase();
    if (!code) {
      setForm((current) => ({ ...current, instrumentId: "" }));
      setJournalMatched(null);
      setJournalLookupNote("已设置为不关联产品");
      return null;
    }
    setJournalLookupBusy(true);
    setJournalLookupNote("正在匹配产品名称和投资类型…");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lookupInstrument",
          code,
          preferredProductType: form.preferredProductType,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        instrument?: JournalInstrument;
      };
      if (!response.ok || !result.instrument)
        throw new Error(result.error || "没有查询到该产品代码");
      const instrument = result.instrument;
      setJournalMatched(instrument);
      setForm((current) => ({
        ...current,
        instrumentCode: code,
        instrumentId: instrument.id > 0 ? String(instrument.id) : "",
        preferredProductType:
          instrument.product_type === "STOCK" ? "STOCK" : "FUND",
      }));
      setJournalLookupNote(
        `已匹配：${instrument.name} · ${journalProductLabel(instrument)} · ${instrument.asset_class}${instrument.market ? ` · ${instrument.market}` : ""}`,
      );
      return instrument;
    } catch (caught) {
      setJournalMatched(null);
      setForm((current) => ({ ...current, instrumentId: "" }));
      setJournalLookupNote(
        caught instanceof Error ? caught.message : "产品代码查询失败",
      );
      return null;
    } finally {
      setJournalLookupBusy(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      action: editing === "new" ? "createJournal" : "updateJournal",
      ...(editing && editing !== "new" ? { id: editing.id } : {}),
      ...form,
    };
    if (form.instrumentCode.trim()) {
      setJournalLookupBusy(true);
      setJournalLookupNote("正在确认并保存产品资料…");
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resolveInstrument",
            code: form.instrumentCode,
            preferredProductType: form.preferredProductType,
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          instrument?: JournalInstrument;
        };
        if (!response.ok || !result.instrument?.id)
          throw new Error(result.error || "产品资料保存失败");
        payload.instrumentId = String(result.instrument.id);
        setJournalMatched(result.instrument);
      } catch (caught) {
        setJournalLookupNote(
          caught instanceof Error ? caught.message : "产品资料保存失败",
        );
        return;
      } finally {
        setJournalLookupBusy(false);
      }
    } else if (!form.instrumentCode.trim()) {
      payload.instrumentId = "";
    }
    const ok = await submit(
      payload,
      editing === "new" ? "复盘记录已保存" : "复盘记录已更新",
    );
    if (ok) setEditing(null);
  };

  return (
    <section className="panel journal-panel">
      <div className="feature-panel-head">
        <div>
          <span className="feature-kicker">
            <BookOpen size={16} /> 投资复盘日记
          </span>
          <h2>记录当时为什么做决定</h2>
          <p>把动作、情绪、投资逻辑和后续验证放在同一条记录里。</p>
        </div>
        <button className="primary-button" onClick={openNew}>
          <Plus size={17} /> 新建复盘
        </button>
      </div>
      {entries.length ? (
        <div className="journal-list">
          {entries.map((entry) => (
            <article key={entry.id}>
              <div className="journal-date">
                <strong>{entry.entry_date.slice(8, 10)}</strong>
                <span>{entry.entry_date.slice(0, 7)}</span>
              </div>
              <div className="journal-content">
                <div className="journal-tags">
                  <span>
                    {decisionLabels[entry.decision] ?? entry.decision}
                  </span>
                  <span>{moodLabels[entry.mood] ?? entry.mood}</span>
                  {entry.instrument_name && (
                    <span>
                      {entry.instrument_name} {entry.instrument_code}
                    </span>
                  )}
                </div>
                <h3>{entry.title}</h3>
                <p>{entry.thesis || "这条记录尚未填写投资逻辑。"}</p>
                {entry.review_note && (
                  <div className="journal-review">
                    <strong>后续验证</strong>
                    <span>{entry.review_note}</span>
                  </div>
                )}
              </div>
              <div className="journal-actions">
                <button aria-label="编辑复盘" onClick={() => openEdit(entry)}>
                  <Edit3 size={17} />
                </button>
                <button
                  aria-label="删除复盘"
                  onClick={() =>
                    confirm("确定删除这条复盘记录？") &&
                    void submit(
                      { action: "deleteJournal", id: entry.id },
                      "复盘记录已删除",
                    )
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <button className="journal-empty" onClick={openNew}>
          <BookOpen size={26} />
          <strong>还没有复盘记录</strong>
          <span>从今天的第一条投资判断开始记录</span>
        </button>
      )}

      {editing && (
        <div
          className="feature-modal-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setEditing(null)
          }
        >
          <form className="feature-modal" onSubmit={save}>
            <div className="feature-modal-head">
              <div>
                <span>投资复盘</span>
                <h2>{editing === "new" ? "新建复盘记录" : "编辑复盘记录"}</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="journal-form-grid">
              <label>
                <span>记录日期</span>
                <input
                  required
                  type="date"
                  value={form.entryDate}
                  onChange={(event) =>
                    setForm({ ...form, entryDate: event.target.value })
                  }
                />
              </label>
              <label>
                <span>投资动作</span>
                <select
                  value={form.decision}
                  onChange={(event) =>
                    setForm({ ...form, decision: event.target.value })
                  }
                >
                  {Object.entries(decisionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>当时情绪</span>
                <select
                  value={form.mood}
                  onChange={(event) =>
                    setForm({ ...form, mood: event.target.value })
                  }
                >
                  {Object.entries(moodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>关联账户（可选）</span>
                <select
                  value={form.accountId}
                  onChange={(event) =>
                    setForm({ ...form, accountId: event.target.value })
                  }
                >
                  <option value="">不关联账户</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>代码类别</span>
                <select
                  value={form.preferredProductType}
                  onChange={(event) => {
                    const preferredProductType = event.target
                      .value as JournalForm["preferredProductType"];
                    const matched = instruments.find((instrument) =>
                      journalCodeMatches(
                        instrument,
                        form.instrumentCode,
                        preferredProductType,
                      ),
                    );
                    setForm({
                      ...form,
                      preferredProductType,
                      instrumentId: matched ? String(matched.id) : "",
                    });
                    setJournalMatched(matched ?? null);
                    setJournalLookupNote(
                      matched
                        ? `已匹配：${matched.name} · ${journalProductLabel(matched)} · ${matched.asset_class}`
                        : form.instrumentCode
                          ? "请点击查询，系统会按代码识别产品名称和类型"
                          : "留空代码即可不关联产品",
                    );
                  }}
                >
                  <option value="AUTO">自动识别</option>
                  <option value="FUND">基金 / ETF</option>
                  <option value="STOCK">沪深 A 股</option>
                </select>
              </label>
              <label className="journal-product-code">
                <span>关联产品代码（可选）</span>
                <div>
                  <input
                    list="journal-instrument-codes"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="例如 001513、600519"
                    value={form.instrumentCode}
                    onChange={(event) => {
                      const instrumentCode = event.target.value.toUpperCase();
                      const matched = instruments.find((instrument) =>
                        journalCodeMatches(
                          instrument,
                          instrumentCode,
                          form.preferredProductType,
                        ),
                      );
                      setForm({
                        ...form,
                        instrumentCode,
                        instrumentId: matched ? String(matched.id) : "",
                      });
                      setJournalMatched(matched ?? null);
                      setJournalLookupNote(
                        matched
                          ? `已匹配：${matched.name} · ${journalProductLabel(matched)} · ${matched.asset_class}`
                          : instrumentCode
                            ? "输入完成后点击查询，自动识别产品名称和投资类型"
                            : "留空代码即可不关联产品",
                      );
                    }}
                    onBlur={() => {
                      if (form.instrumentCode && !journalMatched)
                        void lookupJournalInstrument();
                    }}
                  />
                  <button
                    type="button"
                    aria-label="查询产品代码"
                    disabled={journalLookupBusy || !form.instrumentCode.trim()}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void lookupJournalInstrument()}
                  >
                    <RefreshCcw
                      size={17}
                      className={journalLookupBusy ? "spin" : ""}
                    />
                    {journalLookupBusy ? "查询中" : "查询"}
                  </button>
                </div>
                <datalist id="journal-instrument-codes">
                  {instruments.map((instrument) => (
                    <option key={instrument.id} value={instrument.code}>
                      {instrument.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <div
                className={`journal-product-match journal-form-wide ${
                  journalMatched ? "matched" : ""
                }`}
                aria-live="polite"
              >
                <strong>
                  {journalMatched
                    ? journalMatched.name
                    : "可直接输入基金、ETF 或股票代码"}
                </strong>
                <span>
                  {journalLookupNote ||
                    "系统会自动填入产品名称、市场和投资类型；股票行情目前支持沪深 A 股"}
                </span>
              </div>
              <label className="journal-form-wide">
                <span>标题</span>
                <input
                  required
                  maxLength={100}
                  placeholder="例如：为什么继续持有这只基金"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label className="journal-form-wide">
                <span>当时的投资逻辑</span>
                <textarea
                  maxLength={4000}
                  rows={5}
                  placeholder="记录依据、预期、风险和触发退出的条件"
                  value={form.thesis}
                  onChange={(event) =>
                    setForm({ ...form, thesis: event.target.value })
                  }
                />
              </label>
              <label>
                <span>计划复盘日期（可选）</span>
                <input
                  type="date"
                  value={form.reviewDate}
                  onChange={(event) =>
                    setForm({ ...form, reviewDate: event.target.value })
                  }
                />
              </label>
              <label className="journal-form-wide">
                <span>后续验证 / 结果</span>
                <textarea
                  maxLength={4000}
                  rows={4}
                  placeholder="后来发生了什么？原判断哪里对、哪里错？"
                  value={form.reviewNote}
                  onChange={(event) =>
                    setForm({ ...form, reviewNote: event.target.value })
                  }
                />
              </label>
            </div>
            {error && <p className="feature-form-error">{error}</p>}
            <div className="feature-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={busy || journalLookupBusy}
              >
                {busy || journalLookupBusy ? "保存中…" : "保存复盘"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export function SmartTopUpAdvisor({
  instruments,
  holdings,
  targets,
  cashValue,
}: {
  instruments: Array<{ id: number; name: string; code: string }>;
  holdings: Array<{ instrumentId: number; marketValue: number }>;
  targets: Array<{ instrument_id: number; target_bps: number }>;
  cashValue: number;
}) {
  const [amount, setAmount] = useState("3000");
  const productTargetBps = targets
    .filter((target) => target.instrument_id > 0)
    .reduce((sum, target) => sum + Math.max(0, target.target_bps), 0);
  const explicitCashTargetBps = targets.find(
    (target) => target.instrument_id === 0,
  )?.target_bps;
  const cashTargetBps =
    explicitCashTargetBps ?? Math.max(0, 10_000 - productTargetBps);
  const plan = useMemo(
    () =>
      calculateBuyOnlyTopUp(
        instruments.map((instrument) => ({
          instrumentId: instrument.id,
          name: instrument.name,
          currentValue: holdings
            .filter((holding) => holding.instrumentId === instrument.id)
            .reduce((sum, holding) => sum + holding.marketValue, 0),
          targetBps:
            targets.find((target) => target.instrument_id === instrument.id)
              ?.target_bps ?? 0,
        })),
        Number(amount),
        { currentCash: cashValue, cashTargetBps },
      ),
    [amount, cashTargetBps, cashValue, holdings, instruments, targets],
  );
  const suggestions = plan.suggestions.filter(
    (suggestion) => suggestion.suggestedAmount > 0,
  );
  const cashWithoutProductGap = Math.max(
    0,
    plan.unallocatedAmount - plan.reservedCashAmount,
  );

  return (
    <section className="panel topup-advisor">
      <div className="feature-panel-head">
        <div>
          <span className="feature-kicker">只买补仓方案</span>
          <h2>有一笔新资金，怎么分配</h2>
          <p>
            先按已保存的现金目标保留资金，再只买入低于目标的产品；不会建议卖出，也不会把现金当成要买的产品。
          </p>
        </div>
        <label className="topup-amount">
          <span>这次准备投入</span>
          <div>
            <i>¥</i>
            <input
              inputMode="decimal"
              min="0"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </label>
      </div>
      <div className="topup-plan-summary" aria-label="本次资金安排">
        <div>
          <span>本次保留现金</span>
          <strong>¥{money(plan.reservedCashAmount)}</strong>
          <small>
            {explicitCashTargetBps === undefined
              ? "按旧目标补齐"
              : "已保存现金目标"}{" "}
            {(cashTargetBps / 100).toFixed(1)}%
          </small>
        </div>
        <div>
          <span>实际建议买入</span>
          <strong>¥{money(plan.allocatedAmount)}</strong>
          <small>只分配给仍低于目标的产品</small>
        </div>
      </div>
      {suggestions.length ? (
        <div className="topup-suggestions">
          {suggestions.map((suggestion, index) => (
            <div key={suggestion.instrumentId}>
              <span className="topup-rank">{index + 1}</span>
              <div>
                <strong>{suggestion.name}</strong>
                <span>
                  当前 {(suggestion.currentRate * 100).toFixed(1)}% · 目标{" "}
                  {(suggestion.targetRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="topup-result">
                <strong>买入 ¥{money(suggestion.suggestedAmount)}</strong>
                <span>
                  预计占比 {(suggestion.projectedRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="feature-empty">
          <strong>暂时无法生成补仓方案</strong>
          <span>
            {plan.requestedAmount <= 0
              ? "请输入大于 0 的可投入金额。"
              : productTargetBps <= 0
                ? "已保存的目标目前全部是现金，这笔资金会继续留作现金。"
                : plan.reservedCashAmount >= plan.requestedAmount
                  ? "这笔资金需要先满足现金目标，因此暂不建议买入产品。"
                  : "当前产品已达到或超过目标，没有需要只买补足的缺口；未投入部分会留作现金。"}
          </span>
        </div>
      )}
      <div className="topup-footnote">
        <span>
          本次投入 ¥{money(plan.requestedAmount)}：买入 ¥
          {money(plan.allocatedAmount)}，留作现金 ¥
          {money(plan.unallocatedAmount)}
        </span>
        <span>
          {cashWithoutProductGap > 0
            ? `除现金目标外，另有 ¥${money(cashWithoutProductGap)} 因没有可买缺口而保留。`
            : "修改上方目标后请先保存，再查看新方案。"}
          算法只纠偏配置，不预测涨跌，不构成投资建议。
        </span>
      </div>
    </section>
  );
}

interface LookthroughResponse {
  error?: string;
  notice: string;
  generatedAt: string;
  errors: Array<{ fundCode: string; message: string }>;
  funds: Array<{
    fundCode: string;
    fundName: string;
    reportPeriod: string;
    reportDate: string;
    disclosureDate: string | null;
    source: { name: string; url: string };
  }>;
  lookthrough: {
    disclosedCoveragePercent: number;
    overlaps: unknown[];
    holdings: Array<{
      stockCode: string;
      stockName: string;
      estimatedPortfolioWeightPercent: number;
      fundCount: number;
      isOverlap: boolean;
      exposures: Array<{ fundName: string }>;
    }>;
  };
}

export function FundLookthrough({
  instruments,
  holdings,
  totalAssets,
}: {
  instruments: Array<{
    id: number;
    name: string;
    code: string;
    product_type: string;
  }>;
  holdings: Array<{ instrumentId: number; marketValue: number }>;
  totalAssets: number;
}) {
  const queryFunds = useMemo(
    () =>
      instruments
        .filter(
          (instrument) =>
            /^\d{6}$/.test(instrument.code) &&
            ["FUND", "ETF"].includes(instrument.product_type),
        )
        .map((instrument) => ({
          ...instrument,
          value: holdings
            .filter((holding) => holding.instrumentId === instrument.id)
            .reduce((sum, holding) => sum + holding.marketValue, 0),
        }))
        .filter((instrument) => instrument.value > 0)
        .slice(0, 10),
    [holdings, instruments],
  );
  const queryKey = queryFunds
    .map(
      (fund) =>
        `${fund.code}:${Math.max(0, Math.floor((fund.value / Math.max(1, totalAssets)) * 10_000))}`,
    )
    .join("|");
  const [result, setResult] = useState<LookthroughResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    if (!queryFunds.length) {
      setResult(null);
      setError("");
      return;
    }
    const codes = queryFunds.map((fund) => fund.code);
    const weights = queryFunds.map((fund) =>
      Math.max(0, Math.floor((fund.value / Math.max(1, totalAssets)) * 10_000)),
    );
    setLoading(true);
    setError("");
    try {
      const weightsQuery = weights.some((weight) => weight > 0)
        ? `&weights=${encodeURIComponent(weights.join(","))}`
        : "";
      const response = await fetch(
        `/api/fund-holdings?codes=${encodeURIComponent(codes.join(","))}${weightsQuery}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as LookthroughResponse;
      if (!response.ok || !payload.lookthrough)
        throw new Error(payload.error || "基金持仓披露读取失败");
      setResult(payload);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "基金持仓穿透失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // queryKey is the compact identity of the held funds and their weights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const top = result?.lookthrough.holdings.slice(0, 12) ?? [];
  const maxWeight = Math.max(
    0.01,
    ...top.map((holding) => holding.estimatedPortfolioWeightPercent),
  );
  return (
    <section className="panel lookthrough-panel">
      <div className="feature-panel-head">
        <div>
          <span className="feature-kicker">
            <Layers3 size={16} /> 基金持仓穿透
          </span>
          <h2>你真正持有哪些底层公司</h2>
          <p>按基金定期报告和当前基金市值估算，自动识别多只基金重复持仓。</p>
        </div>
        <button
          className="secondary-button"
          disabled={loading || !queryFunds.length}
          onClick={() => void load()}
        >
          <RefreshCcw size={16} className={loading ? "spin" : ""} />
          {loading ? "穿透中" : "更新披露"}
        </button>
      </div>
      {error ? (
        <div className="feature-empty">
          <strong>暂时无法完成持仓穿透</strong>
          <span>{error}</span>
        </div>
      ) : top.length ? (
        <>
          <div className="lookthrough-summary">
            <div>
              <span>已读取基金</span>
              <strong>{result?.funds.length ?? 0} 只</strong>
            </div>
            <div>
              <span>底层标的</span>
              <strong>{result?.lookthrough.holdings.length ?? 0} 项</strong>
            </div>
            <div>
              <span>重复持仓</span>
              <strong>{result?.lookthrough.overlaps.length ?? 0} 项</strong>
            </div>
            <div>
              <span>披露覆盖组合</span>
              <strong>
                {(result?.lookthrough.disclosedCoveragePercent ?? 0).toFixed(2)}
                %
              </strong>
            </div>
          </div>
          <div className="lookthrough-list">
            {top.map((holding, index) => (
              <div key={`${holding.stockCode}-${holding.stockName}`}>
                <span className="lookthrough-rank">{index + 1}</span>
                <div className="lookthrough-company">
                  <strong>{holding.stockName}</strong>
                  <span>
                    {holding.stockCode}
                    {holding.isOverlap && ` · ${holding.fundCount} 只基金重合`}
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${Math.max(2, (holding.estimatedPortfolioWeightPercent / maxWeight) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <strong className="lookthrough-weight">
                  {holding.estimatedPortfolioWeightPercent.toFixed(2)}%
                  <small>组合估算</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="disclosure-sources">
            {result?.funds.map((fund) => (
              <a
                key={fund.fundCode}
                href={fund.source.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  {fund.fundName} · {fund.reportPeriod}（截至 {fund.reportDate}
                  ）
                </span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
          <p className="feature-disclaimer">{result?.notice}</p>
        </>
      ) : (
        <div className="feature-empty compact">
          <strong>
            {loading ? "正在读取季度持仓披露…" : "暂无可穿透的基金持仓"}
          </strong>
          <span>需要当前持有带六位代码的基金或 ETF。</span>
        </div>
      )}
    </section>
  );
}

interface SimulatorInstrument {
  id: number;
  name: string;
  code: string;
  product_type: string;
}

type SimulatorMode = "history" | "projection";
type HistoryPeriod = "12" | "36" | "60" | "120" | "custom";

interface HistoryDataset {
  earliestDate: string;
  latestDate: string;
  sourceLabel: string;
  availableMonths: number;
  returnMethod: string;
}

const historyPeriodLabel = (period: HistoryPeriod) => {
  if (period === "custom") return "自定义日期";
  const months = Number(period);
  return `近 ${months / 12} 年（${months} 个月）`;
};

const percentText = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;

const chartMoney = (value: unknown) => `¥${money(Number(value), 0)}`;

export function DcaSimulator({
  instruments,
}: {
  instruments: SimulatorInstrument[];
}) {
  const eligible = instruments.filter(
    (instrument) =>
      /^\d{6}$/.test(instrument.code) &&
      ["FUND", "ETF"].includes(instrument.product_type),
  );
  const [instrumentId, setInstrumentId] = useState(() =>
    String(eligible[0]?.id ?? ""),
  );
  const [mode, setMode] = useState<SimulatorMode>("history");
  const [monthlyAmount, setMonthlyAmount] = useState("1000");
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("36");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [result, setResult] = useState<DcaComparisonResult | null>(null);
  const [historyDataset, setHistoryDataset] = useState<HistoryDataset | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [projectionYears, setProjectionYears] = useState("10");
  const [annualReturn, setAnnualReturn] = useState("8");
  const [initialAmount, setInitialAmount] = useState("0");
  const selected =
    eligible.find((instrument) => String(instrument.id) === instrumentId) ??
    eligible[0];

  const clearHistoricalResult = () => {
    setResult(null);
    setHistoryDataset(null);
    setError("");
  };

  const runSimulation = async () => {
    if (!selected) {
      setError("暂无可查询历史净值的六位基金代码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/fund-history?code=${selected.code}`, {
        cache: "no-store",
      });
      const history = (await response.json()) as {
        error?: string;
        points?: Array<{
          date: string;
          nav: number;
          totalReturnNav?: number;
        }>;
        sourceLabel?: string;
        latestDate?: string;
        returnMethod?: string;
      };
      if (!response.ok || !history.points?.length)
        throw new Error(history.error || "历史净值读取失败");
      const orderedPoints = [...history.points].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const simulation = simulateDcaVsLumpSum(history.points, {
        monthlyAmount: Number(monthlyAmount),
        ...(historyPeriod === "custom"
          ? {
              startDate: customStartDate || undefined,
              endDate: customEndDate || undefined,
            }
          : { months: Number(historyPeriod) }),
      });
      setResult(simulation);
      setHistoryDataset({
        earliestDate: orderedPoints[0].date,
        latestDate: history.latestDate ?? orderedPoints.at(-1)?.date ?? "",
        sourceLabel: history.sourceLabel ?? "公开净值",
        returnMethod: history.returnMethod ?? "UNIT_NAV_ONLY",
        availableMonths: new Set(
          orderedPoints.map((point) => point.date.slice(0, 7)),
        ).size,
      });
    } catch (caught) {
      setResult(null);
      setHistoryDataset(null);
      setError(caught instanceof Error ? caught.message : "模拟失败");
    } finally {
      setLoading(false);
    }
  };

  const projectionCalculation = useMemo<{
    result: LongTermDcaProjection | null;
    error: string;
  }>(() => {
    try {
      return {
        result: projectLongTermDca({
          monthlyAmount: Number(monthlyAmount),
          years: Number(projectionYears),
          annualReturn: Number(annualReturn) / 100,
          initialAmount: Number(initialAmount || 0),
        }),
        error: "",
      };
    } catch (caught) {
      return {
        result: null,
        error: caught instanceof Error ? caught.message : "测算参数不正确",
      };
    }
  }, [annualReturn, initialAmount, monthlyAmount, projectionYears]);

  const projection = projectionCalculation.result;
  const projectionCurve = projection
    ? [
        {
          year: 0,
          principal: projection.initialAmount,
          assets: projection.initialAmount,
          profit: 0,
          returnRate: 0,
        },
        ...projection.curve,
      ]
    : [];
  const customRangeLimited = Boolean(
    result &&
    historyDataset &&
    historyPeriod === "custom" &&
    ((customStartDate && customStartDate < historyDataset.earliestDate) ||
      (customEndDate && customEndDate > historyDataset.latestDate)),
  );
  const historyLimited = Boolean(
    result && (result.limitedByHistory || customRangeLimited),
  );
  const actualYears = result ? result.executionCount / 12 : 0;

  return (
    <section className="panel dca-simulator">
      <div className="feature-panel-head">
        <div>
          <span className="feature-kicker">定投模拟器</span>
          <h2>历史回测与长期投入测算</h2>
          <p>历史数据回答“过去怎样”，长期测算回答“按假设坚持几年可能怎样”。</p>
        </div>
      </div>

      <div className="simulator-mode-tabs" role="tablist" aria-label="模拟方式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "history"}
          className={mode === "history" ? "active" : ""}
          onClick={() => setMode("history")}
        >
          <strong>历史回测</strong>
          <span>使用真实历史净值</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "projection"}
          className={mode === "projection" ? "active" : ""}
          onClick={() => setMode("projection")}
        >
          <strong>长期测算</strong>
          <span>持续投入 1–30 年</span>
        </button>
      </div>

      {mode === "history" ? (
        <div className="simulator-workspace">
          <div className="simulator-controls historical-controls">
            <label>
              <span>基金产品</span>
              <select
                value={selected ? String(selected.id) : ""}
                onChange={(event) => {
                  setInstrumentId(event.target.value);
                  clearHistoricalResult();
                }}
              >
                {eligible.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.name} · {instrument.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>每月投入</span>
              <input
                type="number"
                min="1"
                inputMode="decimal"
                value={monthlyAmount}
                onChange={(event) => {
                  setMonthlyAmount(event.target.value);
                  clearHistoricalResult();
                }}
              />
            </label>
            <label>
              <span>请求回测区间</span>
              <select
                value={historyPeriod}
                onChange={(event) => {
                  setHistoryPeriod(event.target.value as HistoryPeriod);
                  clearHistoricalResult();
                }}
              >
                <option value="12">近 1 年</option>
                <option value="36">近 3 年</option>
                <option value="60">近 5 年</option>
                <option value="120">近 10 年</option>
                <option value="custom">自定义日期</option>
              </select>
            </label>
            <button
              className="primary-button"
              disabled={loading || !eligible.length}
              onClick={() => void runSimulation()}
            >
              {loading ? "正在读取净值…" : "开始历史回测"}
            </button>
          </div>

          {historyPeriod === "custom" && (
            <div className="simulator-custom-dates">
              <label>
                <span>开始日期</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => {
                    setCustomStartDate(event.target.value);
                    clearHistoricalResult();
                  }}
                />
              </label>
              <label>
                <span>结束日期</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => {
                    setCustomEndDate(event.target.value);
                    clearHistoricalResult();
                  }}
                />
              </label>
              <p>日期留空表示使用该基金可获得的最早或最新净值。</p>
            </div>
          )}

          {error && <p className="feature-form-error">{error}</p>}
          {result && historyDataset ? (
            <div className="simulator-result historical-result">
              <div className="simulator-period-grid">
                <div>
                  <span>你请求的区间</span>
                  <strong>
                    {historyPeriod === "custom"
                      ? `${customStartDate || "最早可用"} 至 ${customEndDate || "最新可用"}`
                      : historyPeriodLabel(historyPeriod)}
                  </strong>
                </div>
                <div>
                  <span>基金全部可用数据</span>
                  <strong>
                    {historyDataset.earliestDate} 至 {historyDataset.latestDate}
                  </strong>
                  <small>
                    共 {historyDataset.availableMonths} 个月，约{" "}
                    {(historyDataset.availableMonths / 12).toFixed(1)} 年
                  </small>
                </div>
                <div>
                  <span>本次实际回测</span>
                  <strong>
                    {result.startDate} 至 {result.endDate}
                  </strong>
                  <small>
                    {result.executionCount} 次投入，约 {actualYears.toFixed(1)}{" "}
                    年
                  </small>
                </div>
              </div>

              {historyLimited && (
                <div className="simulator-history-warning" role="status">
                  <strong>该基金的历史数据不足以覆盖你请求的完整区间</strong>
                  <span>
                    你选择了 {historyPeriodLabel(historyPeriod)}，但可用净值始于{" "}
                    {historyDataset.earliestDate}。下方只展示实际可获得的{" "}
                    {result.executionCount}{" "}
                    个执行月，不能当作完整十年或完整请求期的表现。
                  </span>
                </div>
              )}

              <div className="simulator-summary-cards">
                <article>
                  <span>累计投入本金</span>
                  <strong>¥{money(result.dca.invested)}</strong>
                  <small>
                    {result.executionCount} 个月 × ¥
                    {money(result.dca.invested / result.executionCount)}
                  </small>
                </article>
                <article>
                  <span>按月定投期末市值</span>
                  <strong>¥{money(result.dca.finalValue)}</strong>
                  <small className={result.dca.profit >= 0 ? "up" : "down"}>
                    {result.dca.profit >= 0 ? "+" : ""}¥
                    {money(result.dca.profit)} ·{" "}
                    {percentText(result.dca.returnRate)}
                  </small>
                </article>
                <article>
                  <span>首日一次投入期末市值</span>
                  <strong>¥{money(result.lumpSum.finalValue)}</strong>
                  <small className={result.lumpSum.profit >= 0 ? "up" : "down"}>
                    {result.lumpSum.profit >= 0 ? "+" : ""}¥
                    {money(result.lumpSum.profit)} ·{" "}
                    {percentText(result.lumpSum.returnRate)}
                  </small>
                </article>
              </div>

              <div className="simulator-chart-card">
                <div className="simulator-chart-head">
                  <div>
                    <strong>本金与策略市值变化</strong>
                    <span>每月最后一个可用净值日估值</span>
                  </div>
                  <span>{result.executionCount} 个数据点</span>
                </div>
                <div className="simulator-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={result.curve}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => String(value).slice(0, 7)}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={32}
                      />
                      <YAxis
                        width={76}
                        tickFormatter={chartMoney}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          chartMoney(value),
                          String(name),
                        ]}
                        labelFormatter={(label) => `估值日期 ${String(label)}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="invested"
                        name="累计本金"
                        stroke="#9ba5b7"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="dcaValue"
                        name="定投市值"
                        stroke="#5878f4"
                        strokeWidth={3}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="lumpSumValue"
                        name="一次性投入市值"
                        stroke="#8a61d5"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="simulator-meta">
                <span>{historyDataset.sourceLabel}公开净值</span>
                <span>最新净值日期 {historyDataset.latestDate}</span>
                <span>
                  总回报路径最大回撤 {(result.dca.maxDrawdown * 100).toFixed(2)}
                  %
                </span>
                <span>现金分红按除息日再投资计入</span>
                <span>未计申购费、赎回费与税费</span>
              </div>
              <p className="simulator-method">
                使用公开日收益率构造含现金分红再投资的总回报路径；
                {result.methodology} 历史回测只描述过去，不代表未来收益。
              </p>
            </div>
          ) : (
            !error && (
              <div className="feature-empty compact simulator-empty">
                <strong>先选择基金和真实回测区间</strong>
                <span>
                  系统会同时显示基金全部数据期、你请求的区间和实际执行月数。
                </span>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="simulator-workspace projection-workspace">
          <div className="projection-controls">
            <label>
              <span>每月持续投入</span>
              <div className="money-input">
                <i>¥</i>
                <input
                  type="number"
                  min="1"
                  inputMode="decimal"
                  value={monthlyAmount}
                  onChange={(event) => {
                    setMonthlyAmount(event.target.value);
                    clearHistoricalResult();
                  }}
                />
              </div>
            </label>
            <label>
              <span>持续投入年限</span>
              <div className="years-input">
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  inputMode="numeric"
                  value={projectionYears}
                  onChange={(event) => setProjectionYears(event.target.value)}
                />
                <i>年</i>
              </div>
            </label>
            <label>
              <span>假设年化收益率</span>
              <div className="years-input">
                <input
                  type="number"
                  min="-99"
                  max="100"
                  step="0.1"
                  inputMode="decimal"
                  value={annualReturn}
                  onChange={(event) => setAnnualReturn(event.target.value)}
                />
                <i>%</i>
              </div>
            </label>
            <label>
              <span>可选初始投入</span>
              <div className="money-input">
                <i>¥</i>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={initialAmount}
                  onChange={(event) => setInitialAmount(event.target.value)}
                />
              </div>
            </label>
          </div>

          <div className="projection-year-presets" aria-label="常用持续年限">
            <span>快速选择：</span>
            {[5, 10, 15, 20, 30].map((year) => (
              <button
                type="button"
                key={year}
                className={Number(projectionYears) === year ? "active" : ""}
                onClick={() => setProjectionYears(String(year))}
              >
                {year} 年
              </button>
            ))}
          </div>

          {projectionCalculation.error && (
            <p className="feature-form-error">{projectionCalculation.error}</p>
          )}
          {projection && (
            <div className="simulator-result projection-result">
              <div className="projection-hero">
                <div>
                  <span>
                    每月投入 ¥{money(projection.monthlyAmount)}，持续{" "}
                    {projection.years} 年
                  </span>
                  <strong>预计资产 ¥{money(projection.finalValue)}</strong>
                  <small>
                    在“每年 {annualReturn}%”这一固定情景下计算，不是收益承诺
                  </small>
                </div>
                <div className="projection-duration">
                  <strong>{projection.years * 12}</strong>
                  <span>个月持续投入</span>
                </div>
              </div>

              <div className="simulator-summary-cards projection-summary">
                <article>
                  <span>累计投入本金</span>
                  <strong>¥{money(projection.principal)}</strong>
                  <small>
                    初始 ¥{money(projection.initialAmount)} + 月投 ¥
                    {money(projection.monthlyAmount)}
                  </small>
                </article>
                <article>
                  <span>情景预计资产</span>
                  <strong>¥{money(projection.finalValue)}</strong>
                  <small>复利按月折算</small>
                </article>
                <article>
                  <span>情景预计收益</span>
                  <strong className={projection.profit >= 0 ? "up" : "down"}>
                    {projection.profit >= 0 ? "+" : ""}¥
                    {money(projection.profit)}
                  </strong>
                  <small className={projection.profit >= 0 ? "up" : "down"}>
                    相对本金 {percentText(projection.returnRate)}
                  </small>
                </article>
              </div>

              <div className="simulator-chart-card">
                <div className="simulator-chart-head">
                  <div>
                    <strong>逐年本金与资产曲线</strong>
                    <span>拖动或修改上方参数，结果会立即重新计算</span>
                  </div>
                  <span>{projection.years} 年情景</span>
                </div>
                <div className="simulator-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={projectionCurve}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="year"
                        tickFormatter={(value) => `${value}年`}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        width={76}
                        tickFormatter={chartMoney}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          chartMoney(value),
                          String(name),
                        ]}
                        labelFormatter={(label) => `第 ${String(label)} 年`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="principal"
                        name="累计本金"
                        stroke="#9ba5b7"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="assets"
                        name="预计资产"
                        stroke="#5878f4"
                        strokeWidth={3}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="simulator-method projection-notice">
                <strong>情景测算，不是预测：</strong>
                {projection.methodology}
                实际基金净值会波动，且还会受到申购费、赎回费、税费、暂停交易和投入中断等因素影响。
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
