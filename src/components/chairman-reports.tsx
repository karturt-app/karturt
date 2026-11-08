"use client";

import { MonthlyReportPrint } from "@/components/monthly-report-print";
import { HouseholdDuesMatrix } from "@/components/household-dues-matrix";
import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarDays, ChartPie, RotateCcw } from "lucide-react";
import type { HouseholdMatrixCell, HouseholdMatrixRow } from "@/lib/reports/aggregation";
import type { RtFinancialReportResponse } from "@/lib/reports/rt-financial-report";

type ReportAmounts = RtFinancialReportResponse["yearly"];
type ChairmanReport = RtFinancialReportResponse;

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const REPORT_VIEW_STORAGE_KEY = "karturt:laporan:view:v1";
const REPORT_VIEW_EVENT = "karturt:laporan:view:change";
type ReportView = "laporan" | "matriks";
let inMemoryReportView: ReportView = "laporan";

function getStoredReportView(): ReportView {
  try {
    const savedView = window.localStorage.getItem(REPORT_VIEW_STORAGE_KEY);
    if (savedView === "matriks" || savedView === "laporan") return savedView;
  } catch {
    return inMemoryReportView;
  }
  return inMemoryReportView;
}

function subscribeToReportView(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(REPORT_VIEW_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(REPORT_VIEW_EVENT, onChange);
  };
}

const currencyFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const integerFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function rupiah(amount: number) {
  return Number.isSafeInteger(amount) && amount >= 0
    ? currencyFormat.format(amount)
    : "Jumlah tidak tersedia";
}

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function dateLabel(value: string) {
  if (!isCanonicalDate(value)) return "Tanggal tidak tersedia";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function reportPeriodLabel(value: string) {
  const [year, month] = value.split("-");
  return `${monthNames[Number(month) - 1]} ${year}`;
}

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isReportAmounts(value: unknown): value is ReportAmounts {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<keyof ReportAmounts, unknown>;
  const safeFields = [
    candidate.target,
    candidate.effectiveTarget,
    candidate.received,
    candidate.openingBalanceReceived,
    candidate.transferReceived,
    candidate.cashReceived,
    candidate.waived,
    candidate.outstanding,
    candidate.obligationCount,
    candidate.waivedCount,
    candidate.notDueCount,
    candidate.overdueCount,
  ].every(isSafeCount);
  if (!safeFields) return false;
  const methodTotal = Number(candidate.transferReceived) + Number(candidate.cashReceived);
  const obligationTotal = Number(candidate.openingBalanceReceived) + Number(candidate.received) + Number(candidate.waived) + Number(candidate.outstanding);
  return Number.isSafeInteger(methodTotal) &&
    Number.isSafeInteger(obligationTotal) &&
    methodTotal === candidate.received &&
    obligationTotal === candidate.effectiveTarget;
}

const matrixAmountFields = [
  "target",
  "effectiveTarget",
  "received",
  "openingBalanceReceived",
  "transferReceived",
  "cashReceived",
  "waived",
  "outstanding",
] as const;

function isHouseholdMatrixCell(value: unknown, expectedMonth: number, year: number, businessDate: string): value is HouseholdMatrixCell {
  if (!value || typeof value !== "object") return false;
  const cell = value as Partial<HouseholdMatrixCell>;
  if (
    cell.month !== expectedMonth ||
    !["unpaid", "paid", "waived", "not_due", "no_data"].includes(cell.status ?? "") ||
    !(cell.dueDate === null || isCanonicalDate(cell.dueDate)) ||
    !(cell.recordedAmount === null || (isSafeCount(cell.recordedAmount) && cell.recordedAmount > 0)) ||
    !matrixAmountFields.every((field) => isSafeCount(cell[field])) ||
    typeof cell.pending !== "boolean" ||
    typeof cell.overdue !== "boolean" ||
    !(cell.latestPaymentAt === null || isCanonicalTimestamp(cell.latestPaymentAt))
  ) return false;

  const validCell = cell as HouseholdMatrixCell;
  const total = validCell.openingBalanceReceived + validCell.received + validCell.waived + validCell.outstanding;
  if (!Number.isSafeInteger(total) || total !== validCell.effectiveTarget) return false;

  if (validCell.status === "no_data") {
    return validCell.recordedAmount === null && validCell.dueDate === null && !validCell.pending && !validCell.overdue && validCell.latestPaymentAt === null &&
      matrixAmountFields.every((field) => validCell[field] === 0);
  }

  if (
    !validCell.dueDate ||
    validCell.dueDate.slice(0, 4) !== String(year) ||
    Number(validCell.dueDate.slice(5, 7)) !== expectedMonth ||
    validCell.dueDate.slice(8, 10) !== "10" ||
    validCell.overdue !== (validCell.outstanding > 0 && validCell.dueDate < businessDate)
  ) return false;

  if (validCell.status === "not_due") {
    return !validCell.pending && validCell.latestPaymentAt === null && matrixAmountFields.every((field) => validCell[field] === 0);
  }
  if (validCell.status === "waived") {
    return validCell.target > 0 && validCell.waived === validCell.effectiveTarget && validCell.waived > 0 &&
      validCell.received === 0 && validCell.openingBalanceReceived === 0 && validCell.outstanding === 0;
  }
  if (validCell.status === "paid") {
    return validCell.target > 0 && validCell.outstanding === 0 && validCell.waived === 0 &&
      validCell.received + validCell.openingBalanceReceived > 0;
  }
  return validCell.status === "unpaid" && validCell.target > 0 && validCell.outstanding > 0 && validCell.waived === 0;
}

function isHouseholdMatrixRow(value: unknown, year: number, businessDate: string): value is HouseholdMatrixRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<HouseholdMatrixRow>;
  if (
    "householdId" in row || "rtUnitId" in row ||
    !isSafeCount(row.key) || row.key < 1 ||
    typeof row.houseNumber !== "string" || !row.houseNumber.trim() ||
    !(typeof row.houseLabel === "string" || row.houseLabel === null) ||
    !Array.isArray(row.residentNames) || !row.residentNames.every((name) => typeof name === "string") ||
    (row.lifecycle !== "active" && row.lifecycle !== "historical") ||
    !isCanonicalDate(row.startsOn) ||
    !(row.endsOn === null || isCanonicalDate(row.endsOn)) ||
    (row.lifecycle === "active" && row.endsOn !== null) ||
    (row.lifecycle === "historical" && row.endsOn === null) ||
    !Array.isArray(row.months) || row.months.length !== 12 ||
    !row.months.every((cell, index) => isHouseholdMatrixCell(cell, index + 1, year, businessDate)) ||
    !(row.latestPaymentAt === null || isCanonicalTimestamp(row.latestPaymentAt))
  ) return false;

  const latestCellPayment = row.months.reduce<string | null>((latest, cell) => {
    if (!cell.latestPaymentAt) return latest;
    return !latest || cell.latestPaymentAt > latest ? cell.latestPaymentAt : latest;
  }, null);
  return row.latestPaymentAt === latestCellPayment;
}

function isHouseholdMatrix(
  value: unknown,
  year: number,
  businessDate: string,
  monthly: RtFinancialReportResponse["monthly"],
): value is HouseholdMatrixRow[] {
  if (!Array.isArray(value) || !value.every((row) => isHouseholdMatrixRow(row, year, businessDate))) return false;

  const totals = monthly.map(() => ({
    target: 0,
    effectiveTarget: 0,
    received: 0,
    openingBalanceReceived: 0,
    transferReceived: 0,
    cashReceived: 0,
    waived: 0,
    outstanding: 0,
    obligationCount: 0,
    waivedCount: 0,
    notDueCount: 0,
    overdueCount: 0,
  }));
  for (const row of value as HouseholdMatrixRow[]) {
    for (const cell of row.months) {
      const total = totals[cell.month - 1];
      if (!total) return false;
      for (const field of matrixAmountFields) {
        total[field] += cell[field];
        if (!Number.isSafeInteger(total[field])) return false;
      }
      if (cell.status === "unpaid" || cell.status === "paid" || cell.status === "waived") total.obligationCount += 1;
      if (cell.status === "waived") total.waivedCount += 1;
      if (cell.status === "not_due") total.notDueCount += 1;
      if (cell.overdue) total.overdueCount += 1;
    }
  }
  return monthly.every((month, index) => {
    const total = totals[index];
    return total !== undefined &&
      matrixAmountFields.every((field) => total[field] === month[field]) &&
      total.obligationCount === month.obligationCount &&
      total.waivedCount === month.waivedCount &&
      total.notDueCount === month.notDueCount &&
      total.overdueCount === month.overdueCount;
  });
}

function isChairmanReport(value: unknown, expectedYear: number): value is ChairmanReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChairmanReport>;
  if (
    candidate.year !== expectedYear ||
    !candidate.asOf ||
    !isCanonicalDate(candidate.asOf.businessDate) ||
    candidate.asOf.period !== candidate.asOf.businessDate.slice(0, 7) ||
    !isSafeCount(candidate.dueNowOutstanding) ||
    !isSafeCount(candidate.futureUnpaidOutstanding) ||
    !Array.isArray(candidate.availableYears) ||
    !candidate.availableYears.every((year) => isSafeCount(year) && year >= 2000 && year <= 2200) ||
    !isReportAmounts(candidate.yearly) ||
    !Array.isArray(candidate.monthly) ||
    candidate.monthly.length !== 12 ||
    !candidate.monthly.every((month, index) =>
      Boolean(month) &&
      month.month === index + 1 &&
      isReportAmounts(month)
    )
  ) {
    return false;
  }
  if (!isHouseholdMatrix(candidate.householdMatrix, expectedYear, candidate.asOf.businessDate, candidate.monthly)) {
    return false;
  }
  const asOfPeriod = candidate.asOf.period;
  const asOfBusinessDate = candidate.asOf.businessDate;

  const arrears = candidate.arrears;
  if (
    !arrears ||
    !isSafeCount(arrears.totalOutstanding) ||
    !isSafeCount(arrears.count) ||
    !isSafeCount(arrears.householdCount) ||
    !Array.isArray(arrears.households)
  ) {
    return false;
  }

  const arrearsHouseholdsAreValid = arrears.households.every((household) =>
    Boolean(household) &&
    typeof household.houseNumber === "string" &&
    (typeof household.houseLabel === "string" || household.houseLabel === null) &&
    Array.isArray(household.residentNames) &&
    household.residentNames.every((name) => typeof name === "string") &&
    (household.lifecycle === "active" || household.lifecycle === "historical") &&
    typeof household.startsOn === "string" &&
    (typeof household.endsOn === "string" || household.endsOn === null) &&
    isSafeCount(household.totalOutstanding) &&
    typeof household.pending === "boolean" &&
    Array.isArray(household.periods) &&
    household.periods.every((period) =>
      Boolean(period) &&
      isSafeCount(period.month) &&
      period.month >= 1 && period.month <= 12 &&
      isCanonicalDate(period.dueDate) &&
      period.dueDate.slice(0, 4) === String(candidate.year) &&
      Number(period.dueDate.slice(5, 7)) === period.month &&
      period.dueDate < asOfBusinessDate &&
      isSafeCount(period.outstanding) &&
      typeof period.pending === "boolean"
    )
  );
  if (!arrearsHouseholdsAreValid || arrears.householdCount !== arrears.households.length) return false;

  const amountFields = [
    "target",
    "effectiveTarget",
    "received",
    "openingBalanceReceived",
    "transferReceived",
    "cashReceived",
    "waived",
    "outstanding",
    "obligationCount",
    "waivedCount",
    "notDueCount",
    "overdueCount",
  ] as const;
  for (const field of amountFields) {
    let total = 0;
    for (const month of candidate.monthly) {
      total += month[field];
      if (!Number.isSafeInteger(total)) return false;
    }
    if (total !== candidate.yearly[field]) return false;
  }

  let dueNowFromMonths = 0;
  let futureFromMonths = 0;
  for (const month of candidate.monthly) {
    const monthPeriod = `${candidate.year}-${String(month.month).padStart(2, "0")}`;
    if (monthPeriod <= asOfPeriod) {
      dueNowFromMonths += month.outstanding;
      if (!Number.isSafeInteger(dueNowFromMonths)) return false;
    } else {
      futureFromMonths += month.outstanding;
      if (!Number.isSafeInteger(futureFromMonths)) return false;
    }
  }
  if (
    dueNowFromMonths !== candidate.dueNowOutstanding ||
    futureFromMonths !== candidate.futureUnpaidOutstanding ||
    dueNowFromMonths + futureFromMonths !== candidate.yearly.outstanding
  ) return false;

  let arrearsTotal = 0;
  let arrearsCount = 0;
  const arrearsByMonth = candidate.monthly.map(() => ({ count: 0, outstanding: 0 }));
  for (const household of arrears.households) {
    let householdTotal = 0;
    for (const period of household.periods) {
      householdTotal += period.outstanding;
      arrearsCount += 1;
      if (!Number.isSafeInteger(householdTotal) || !Number.isSafeInteger(arrearsCount)) return false;
      const month = arrearsByMonth[period.month - 1];
      if (!month) return false;
      month.count += 1;
      month.outstanding += period.outstanding;
      if (!Number.isSafeInteger(month.count) || !Number.isSafeInteger(month.outstanding)) return false;
    }
    if (householdTotal !== household.totalOutstanding) return false;
    arrearsTotal += householdTotal;
    if (!Number.isSafeInteger(arrearsTotal)) return false;
  }
  for (const [index, month] of candidate.monthly.entries()) {
    const monthlyArrears = arrearsByMonth[index];
    if (!monthlyArrears) return false;
    const monthPeriod = `${candidate.year}-${String(month.month).padStart(2, "0")}`;
    if (`${monthPeriod}-10` < asOfBusinessDate) {
      if (monthlyArrears.count !== month.overdueCount || monthlyArrears.outstanding !== month.outstanding) return false;
    } else if (monthlyArrears.count !== 0 || month.overdueCount !== 0) {
      return false;
    }
  }
  return arrearsTotal === arrears.totalOutstanding &&
    arrearsTotal <= candidate.dueNowOutstanding &&
    arrearsCount === arrears.count &&
    arrearsCount === candidate.yearly.overdueCount;
}

function safeErrorMessage(status: number): string {
  if (status === 401) return "Sesi Anda berakhir. Masuk kembali untuk melihat laporan.";
  if (status === 403 || status === 404) return "Laporan tidak tersedia untuk akun ini.";
  if (status === 400) return "Tahun laporan tidak dapat dibaca. Pilih tahun yang tersedia.";
  return "Laporan belum dapat dimuat. Periksa koneksi lalu coba lagi.";
}

function Metric({ label, amount, count, countUnit }: { label: string; amount?: number; count?: number; countUnit?: string }) {
  return (
    <div className="chairman-report-metric">
      <dt>{label}</dt>
      <dd>{amount === undefined ? `${integerFormat.format(count ?? 0)}${countUnit ? ` ${countUnit}` : ""}` : rupiah(amount)}</dd>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="chairman-report-loading" role="status" aria-live="polite">
      <span className="chairman-report-spinner" aria-hidden="true" />
      <span>Memuat laporan…</span>
    </div>
  );
}

function retryButton(onClick: () => void) {
  return (
    <button className="chairman-report-button" type="button" onClick={onClick}>
      <RotateCcw size={17} aria-hidden="true" />
      Coba lagi
    </button>
  );
}

function ReportDisclosure({
  treasurerMode,
  title,
  children,
}: {
  treasurerMode: boolean;
  title: string;
  children: ReactNode;
}) {
  return treasurerMode ? (
    <details className="treasurer-report-disclosure">
      <summary>{title}</summary>
      <div className="treasurer-report-disclosure-content">{children}</div>
    </details>
  ) : <>{children}</>;
}

export function ChairmanReports({
  initialYear,
  initialMonth,
  rtIdentity,
  autoSelectAvailableYear,
  treasurerMode = false,
}: {
  initialYear: number;
  initialMonth: number;
  rtIdentity: string;
  autoSelectAvailableYear: boolean;
  treasurerMode?: boolean;
}) {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [data, setData] = useState<ChairmanReport | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const activeView = useSyncExternalStore(
    subscribeToReportView,
    getStoredReportView,
    () => "laporan",
  );
  const autoSelectRef = useRef(autoSelectAvailableYear);

  function changeView(nextView: ReportView) {
    inMemoryReportView = nextView;
    try {
      window.localStorage.setItem(REPORT_VIEW_STORAGE_KEY, nextView);
    } catch {
      // Keep this preference optional when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(REPORT_VIEW_EVENT));
  }

  useEffect(() => {
    if (autoSelectAvailableYear) {
      router.replace(`/app/laporan?year=${initialYear}&month=${initialMonth}`, { scroll: false });
    }
  }, [autoSelectAvailableYear, initialYear, initialMonth, router]);

  useEffect(() => {
    const controller = new AbortController();
    let selectingDefaultYear = false;
    async function loadReport() {
      setData(null);
      setError("");
      setLoading(true);
      try {
        const response = await fetch(`/api/chairman/reports?year=${selectedYear}`, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(safeErrorMessage(response.status));
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new Error(safeErrorMessage(500));
        }
        if (!isChairmanReport(payload, selectedYear)) throw new Error(safeErrorMessage(500));
        setAvailableYears(payload.availableYears);

        if (
          autoSelectRef.current &&
          payload.availableYears.length > 0 &&
          !payload.availableYears.includes(selectedYear)
        ) {
          const newestYear = Math.max(...payload.availableYears);
          autoSelectRef.current = false;
          selectingDefaultYear = true;
          setSelectedYear(newestYear);
          router.replace(`/app/laporan?year=${newestYear}&month=${initialMonth}`, { scroll: false });
          return;
        }

        autoSelectRef.current = false;
        setData(payload);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          const allowedMessages = [400, 401, 403, 500].map(safeErrorMessage);
          setError(loadError instanceof Error && allowedMessages.includes(loadError.message)
            ? loadError.message
            : safeErrorMessage(500));
        }
      } finally {
        if (!controller.signal.aborted && !selectingDefaultYear) setLoading(false);
      }
    }
    void loadReport();
    return () => controller.abort();
  }, [retryToken, router, selectedYear, initialMonth]);

  function changeYear(event: ChangeEvent<HTMLSelectElement>) {
    const nextYear = Number(event.target.value);
    if (!Number.isInteger(nextYear) || nextYear < 2000 || nextYear > 2200) return;
    autoSelectRef.current = false;
    setData(null);
    setError("");
    setLoading(true);
    setSelectedYear(nextYear);
    router.replace(`/app/laporan?year=${nextYear}&month=${selectedMonth}`, { scroll: false });
  }

  function retry() {
    setError("");
    setLoading(true);
    setRetryToken((token) => token + 1);
  }

  const years = [...new Set([selectedYear, ...availableYears])]
    .sort((left, right) => right - left);
  const hasYearData = Boolean(data && (data.yearly.obligationCount > 0 || data.yearly.notDueCount > 0));
  const asOfPeriodLabel = data ? reportPeriodLabel(data.asOf.period) : "";
  const hasRecordingCorrections = Boolean(data?.householdMatrix.some((row) => row.months.some((cell) => cell.recordedAmount !== null)));

  return (
    <section className="chairman-reports-area" aria-labelledby="chairman-reports-title" aria-busy={loading}>
      <div className="chairman-reports-heading">
        <p className="eyebrow">LAPORAN IURAN</p>
        <h1 id="chairman-reports-title">Laporan iuran</h1>
        <p>{treasurerMode ? "Pilih tampilan laporan atau matriks tahunan." : "Pilih tampilan ringkasan atau matriks iuran tahunan."}</p>
      </div>

      <div className="chairman-report-year-panel">
        <div className="chairman-report-year-icon" aria-hidden="true"><CalendarDays size={21} /></div>
        <div className="chairman-report-year-copy">
          <label htmlFor="chairman-report-year">Tahun laporan</label>
          <select
            id="chairman-report-year"
            value={selectedYear}
            onChange={changeYear}
            disabled={loading && availableYears.length === 0}
          >
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>

      {loading && <ReportSkeleton />}

      {error && (
        <div className="chairman-report-alert" role="alert">
          <AlertCircle size={19} aria-hidden="true" />
          <p>{error}</p>
          {retryButton(retry)}
        </div>
      )}

      {data && !loading && !error && (
        <>
          {hasRecordingCorrections && (
            <div className="chairman-report-recording-note" role="note">
              Nominal pencatatan 2026 telah dikoreksi untuk rumah tertentu. Tahun ini belum menjadi laporan resmi; status pembayaran dan riwayat penerimaan tetap mengikuti catatan historis.
            </div>
          )}
          <div className="chairman-report-view-switch" role="group" aria-label="Tampilan laporan iuran">
            <button
              type="button"
              className={activeView === "laporan" ? "is-active" : ""}
              aria-pressed={activeView === "laporan"}
              onClick={() => changeView("laporan")}
            >
              Laporan
            </button>
            <button
              type="button"
              className={activeView === "matriks" ? "is-active" : ""}
              aria-pressed={activeView === "matriks"}
              onClick={() => changeView("matriks")}
            >
              Matriks
            </button>
          </div>

          <div className="chairman-report-view-panel" hidden={activeView !== "laporan"}>
          <MonthlyReportPrint treasurerMode={treasurerMode} report={data} rtIdentity={rtIdentity} month={selectedMonth} onMonthChange={(month) => {
            setSelectedMonth(month);
            router.replace(`/app/laporan?year=${selectedYear}&month=${month}`, { scroll: false });
          }} />
          {!hasYearData && (
            <div className="chairman-report-empty" role="status">
              <ChartPie size={24} aria-hidden="true" />
              <div>
                <strong>Belum ada data tagihan untuk {data.year}.</strong>
                <p>Ringkasan periode di bawah ini tetap ditampilkan dengan nilai yang tersedia.</p>
              </div>
            </div>
          )}

          <ReportDisclosure treasurerMode={treasurerMode} title="Kewajiban menurut periode">
          <section className="chairman-report-panel" aria-labelledby="chairman-report-position-title">
            <div className="chairman-report-panel-heading">
              <div>
                <p className="eyebrow">POSISI PER {dateLabel(data.asOf.businessDate).toLocaleUpperCase("id-ID")}</p>
                <h2 id="chairman-report-position-title">Kewajiban menurut periode</h2>
              </div>
            </div>
            <dl className="chairman-report-metrics">
              <Metric label={`Perlu dibayar sampai ${asOfPeriodLabel}`} amount={data.dueNowOutstanding} />
              <Metric label={`Belum jatuh tempo setelah ${asOfPeriodLabel}`} amount={data.futureUnpaidOutstanding} />
            </dl>
            <p className="chairman-report-identity">
              Sisa tahunan terbagi antara periode sampai bulan berjalan dan periode setelahnya.
              <span>{rupiah(data.dueNowOutstanding)} + {rupiah(data.futureUnpaidOutstanding)} = {rupiah(data.yearly.outstanding)}</span>
            </p>
          </section>
          </ReportDisclosure>

          <ReportDisclosure treasurerMode={treasurerMode} title="Ringkasan tahunan">
          <section className="chairman-report-panel" aria-labelledby="chairman-report-summary-title">
            <div className="chairman-report-panel-heading">
              <div>
                <p className="eyebrow">TAHUN {data.year}</p>
                <h2 id="chairman-report-summary-title">Ringkasan tahunan</h2>
              </div>
            </div>
            {data.yearly.effectiveTarget > 0 && (() => {
              const realizedTotal = data.yearly.received + data.yearly.openingBalanceReceived + data.yearly.waived;
              const pct = Math.min(100, Math.round((realizedTotal / data.yearly.effectiveTarget) * 100));
              return (
                <div className="report-collection-progress" aria-label={`Realisasi kas tahun ${data.year}`}>
                  <div className="report-collection-meta">
                    <span>Realisasi terhadap target efektif</span>
                    <strong>{pct}%</strong>
                  </div>
                  <div className="report-collection-track" aria-hidden="true">
                    <span className="report-collection-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}
            <dl className="chairman-report-metrics">
              <Metric label="Target awal" amount={data.yearly.target} />
              <Metric label="Target efektif" amount={data.yearly.effectiveTarget} />
              <Metric label="Diterima" amount={data.yearly.received} />
              <Metric label="Saldo awal impor Sheet2" amount={data.yearly.openingBalanceReceived} />
              <Metric label="Belum diterima · akuntansi tahunan" amount={data.yearly.outstanding} />
              <Metric label="Transfer" amount={data.yearly.transferReceived} />
              <Metric label="Tunai" amount={data.yearly.cashReceived} />
              <Metric label="Dibebaskan" amount={data.yearly.waived} />
              <Metric label="Tidak ditagih" count={data.yearly.notDueCount} countUnit="tagihan" />
            </dl>
            <details className="report-calculation-disclosure">
              <summary>Cara menghitung ringkasan</summary>
            <p className="chairman-report-identity">
              Transfer + tunai = pembayaran terverifikasi.
              <span>{rupiah(data.yearly.transferReceived)} + {rupiah(data.yearly.cashReceived)} = {rupiah(data.yearly.received)}</span>
            </p>
            <p className="chairman-report-identity">
              Saldo awal impor Sheet2 + pembayaran terverifikasi + dibebaskan + sisa kewajiban = target efektif.
              <span>{rupiah(data.yearly.openingBalanceReceived)} + {rupiah(data.yearly.received)} + {rupiah(data.yearly.waived)} + {rupiah(data.yearly.outstanding)} = {rupiah(data.yearly.effectiveTarget)}</span>
            </p>
            </details>
          </section>
          </ReportDisclosure>

          <ReportDisclosure treasurerMode={treasurerMode} title="Rincian 12 bulan">
          <section className="chairman-report-section" aria-labelledby="chairman-report-monthly-title">
            <div className="chairman-report-section-heading">
              <div>
                <p className="eyebrow">PERIODE TAGIHAN</p>
                <h2 id="chairman-report-monthly-title">Rincian bulanan</h2>
              </div>
              <span className="chairman-report-section-note">Januari–Desember {data.year}</span>
            </div>
            <details className="report-months-disclosure">
              <summary>Tampilkan rincian 12 bulan tahun {data.year}</summary>
              <div className="chairman-report-month-list">
                {data.monthly.map((month) => {
                const monthPeriod = `${data.year}-${String(month.month).padStart(2, "0")}`;
                const futurePeriod = monthPeriod > data.asOf.period;
                const currentPeriod = monthPeriod === data.asOf.period;
                const fullyPaidAhead = futurePeriod && month.outstanding === 0 && month.received > 0 && month.waived === 0;
                return (
                  <article className="chairman-report-month-card" key={`${data.year}-${month.month}`}>
                    <header className="chairman-report-month-heading">
                      <h3>{monthNames[month.month - 1]}</h3>
                      <div className="chairman-report-badges">
                        {month.obligationCount === 0 && month.notDueCount === 0 && <span className="chairman-report-badge is-no-data">Belum ada data tagihan</span>}
                        {month.notDueCount > 0 && <span className="chairman-report-badge is-not-due">Tidak ditagih · {integerFormat.format(month.notDueCount)}</span>}
                        {month.waivedCount > 0 && <span className="chairman-report-badge is-waived">Dibebaskan · {integerFormat.format(month.waivedCount)}</span>}
                        {month.overdueCount > 0 && <span className="chairman-report-badge is-overdue">Tunggakan · {integerFormat.format(month.overdueCount)}</span>}
                        {month.outstanding > 0 && currentPeriod && <span className="chairman-report-badge is-current">Bulan berjalan</span>}
                        {month.outstanding > 0 && futurePeriod && <span className="chairman-report-badge is-future">Belum jatuh tempo</span>}
                        {fullyPaidAhead && <span className="chairman-report-badge is-paid-ahead">Lunas di muka</span>}
                      </div>
                    </header>
                    <dl className="chairman-report-metrics chairman-report-metrics--month">
                      <Metric label="Target awal" amount={month.target} />
                      <Metric label="Target efektif" amount={month.effectiveTarget} />
                      <Metric label="Diterima" amount={month.received} />
                      <Metric label="Saldo awal impor Sheet2" amount={month.openingBalanceReceived} />
                      <Metric label="Transfer" amount={month.transferReceived} />
                      <Metric label="Tunai" amount={month.cashReceived} />
                      <Metric label="Dibebaskan" amount={month.waived} />
                      <Metric label="Sisa kewajiban" amount={month.outstanding} />
                    </dl>
                    <p className="chairman-report-identity">
                      Transfer + tunai = pembayaran terverifikasi.
                      <span>{rupiah(month.transferReceived)} + {rupiah(month.cashReceived)} = {rupiah(month.received)}</span>
                    </p>
                    <p className="chairman-report-identity">
                      Saldo awal impor Sheet2 + pembayaran terverifikasi + dibebaskan + sisa kewajiban = target efektif.
                      <span>{rupiah(month.openingBalanceReceived)} + {rupiah(month.received)} + {rupiah(month.waived)} + {rupiah(month.outstanding)} = {rupiah(month.effectiveTarget)}</span>
                    </p>
                  </article>
                );
              })}
              </div>
            </details>
          </section>
          </ReportDisclosure>

          <ReportDisclosure treasurerMode={treasurerMode} title="Daftar tunggakan">
          <section className="chairman-report-section" aria-labelledby="chairman-report-arrears-title">
            <div className="chairman-report-section-heading">
              <div>
                <p className="eyebrow">LEWAT JATUH TEMPO</p>
                <h2 id="chairman-report-arrears-title">Tunggakan</h2>
              </div>
              <span className="chairman-report-arrears-total">{rupiah(data.arrears.totalOutstanding)}</span>
            </div>
            <p className="chairman-report-arrears-note">
              {integerFormat.format(data.arrears.count)} periode tunggakan pada {integerFormat.format(data.arrears.householdCount)} rumah tangga.
            </p>
            {data.arrears.households.length === 0 ? (
              <div className="chairman-report-empty chairman-report-empty--compact" role="status">
                <div>
                  <strong>Tidak ada tunggakan yang melewati jatuh tempo.</strong>
                  <p>Tagihan yang belum jatuh tempo tidak dihitung sebagai tunggakan.</p>
                </div>
              </div>
            ) : (
              <div className="chairman-report-arrears-list">
                {data.arrears.households.map((household, householdIndex) => (
                  <article
                    className="chairman-report-household-card"
                    key={`${household.houseNumber}-${household.startsOn}-${householdIndex}`}
                  >
                    <header className="chairman-report-household-heading">
                      <div className="chairman-report-household-title">
                        <h3>Rumah {household.houseNumber}{household.houseLabel ? ` · ${household.houseLabel}` : ""}</h3>
                        <p>{household.residentNames.length > 0 ? household.residentNames.join(", ") : "Nama warga tidak tercatat"}</p>
                      </div>
                      <span className={`chairman-report-lifecycle${household.lifecycle === "active" ? " is-active" : " is-historical"}`}>
                        {household.lifecycle === "active" ? "Aktif" : "Riwayat"}
                      </span>
                    </header>
                    <div className="chairman-report-household-facts">
                      <span>Masa tinggal</span>
                      <strong>{dateLabel(household.startsOn)}{household.endsOn ? ` – ${dateLabel(household.endsOn)}` : " – sekarang"}</strong>
                    </div>
                    {household.pending && <p className="chairman-report-household-pending">Menunggu konfirmasi</p>}
                    <ul className="chairman-report-period-list">
                      {household.periods.map((period) => (
                        <li key={`${period.month}-${period.dueDate}`}>
                          <div>
                            <strong>{monthNames[period.month - 1]} {data.year}</strong>
                            <span>Jatuh tempo {dateLabel(period.dueDate)}</span>
                            {period.pending && <span className="chairman-report-pending-badge">Menunggu konfirmasi</span>}
                          </div>
                          <strong className="chairman-report-period-amount">{rupiah(period.outstanding)}</strong>
                        </li>
                      ))}
                    </ul>
                    <div className="chairman-report-household-total">
                      <span>Total tunggakan rumah tangga</span>
                      <strong>{rupiah(household.totalOutstanding)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          </ReportDisclosure>
          </div>

          <div className="chairman-report-view-panel" hidden={activeView !== "matriks"}>
            <HouseholdDuesMatrix report={data} />
          </div>
        </>
      )}
    </section>
  );
}
