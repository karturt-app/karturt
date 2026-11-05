"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import {
  filterAndSortHouseholdMatrix,
  householdMatrixDisplayStatus,
  type HouseholdMatrixDirection,
  type HouseholdMatrixFilter,
  type HouseholdMatrixSort,
} from "@/lib/reports/household-matrix";
import type { HouseholdMatrixCell } from "@/lib/reports/aggregation";
import type { RtFinancialReportResponse } from "@/lib/reports/rt-financial-report";

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const monthAbbreviations = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const currencyFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const integerFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

const statusLabels = {
  paid: "Lunas",
  pending: "Menunggu verifikasi",
  overdue: "Tunggakan",
  unpaid: "Belum bayar",
  upcoming: "Belum jatuh tempo",
  waived: "Dibebaskan",
  not_due: "Tidak ada kewajiban",
  no_data: "Data belum tersedia",
} as const;

function rupiah(amount: number) {
  return Number.isSafeInteger(amount) && amount >= 0
    ? currencyFormat.format(amount)
    : "Jumlah tidak tersedia";
}

function dateLabel(value: string | null) {
  if (!value) return "Tanggal tidak tersedia";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return "Tanggal tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function timestampLabel(value: string | null) {
  if (!value) return "Belum ada pembayaran terverifikasi pada tahun ini.";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Tanggal pembayaran tidak tersedia.";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

function cellAmount(cell: HouseholdMatrixCell) {
  switch (cell.status) {
    case "paid":
      return rupiah(cell.received + cell.openingBalanceReceived);
    case "waived":
      return rupiah(cell.waived);
    case "not_due":
    case "no_data":
      return "—";
    default:
      return rupiah(cell.outstanding);
  }
}

function periodStatusDescription(cell: HouseholdMatrixCell, businessDate: string) {
  const status = householdMatrixDisplayStatus(cell, businessDate);
  if (status === "pending") {
    return cell.overdue
      ? "Pengajuan menunggu verifikasi dan sisanya sudah melewati tanggal jatuh tempo."
      : "Pengajuan menunggu verifikasi; jumlahnya belum dihitung sebagai pembayaran diterima.";
  }
  if (status === "overdue") return "Sisa kewajiban melewati tanggal jatuh tempo.";
  if (status === "upcoming") return "Tanggal jatuh tempo belum tercapai.";
  return statusLabels[status] + ".";
}

export function HouseholdDuesMatrix({ report }: { report: RtFinancialReportResponse }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HouseholdMatrixFilter>("all");
  const [sort, setSort] = useState<HouseholdMatrixSort>("house_number");
  const [direction, setDirection] = useState<HouseholdMatrixDirection>("asc");
  const [selectedCell, setSelectedCell] = useState<{ rowKey: number; month: number } | null>(null);

  const visibleRows = useMemo(() => filterAndSortHouseholdMatrix(report.householdMatrix, {
    search,
    filter,
    sort,
    direction,
    businessDate: report.asOf.businessDate,
  }), [report.asOf.businessDate, report.householdMatrix, search, filter, sort, direction]);

  const selectedRow = selectedCell
    ? report.householdMatrix.find((row) => row.key === selectedCell.rowKey)
    : undefined;
  const selectedMonth = selectedCell
    ? selectedRow?.months.find((month) => month.month === selectedCell.month)
    : undefined;
  const selectedStatus = selectedMonth
    ? householdMatrixDisplayStatus(selectedMonth, report.asOf.businessDate)
    : undefined;

  function changeSearch(event: ChangeEvent<HTMLInputElement>) {
    setSelectedCell(null);
    setSearch(event.target.value);
  }

  function changeFilter(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedCell(null);
    setFilter(event.target.value as HouseholdMatrixFilter);
  }

  function changeSort(event: ChangeEvent<HTMLSelectElement>) {
    const nextSort = event.target.value as HouseholdMatrixSort;
    setSort(nextSort);
    setDirection(nextSort === "house_number" || nextSort === "name" ? "asc" : "desc");
  }

  return (
    <section className="household-matrix" aria-labelledby="household-matrix-title">
      <div className="household-matrix-heading">
        <div>
          <p className="eyebrow">PENGAWASAN IURAN TAHUNAN</p>
          <h2 id="household-matrix-title">Matriks iuran per rumah</h2>
          <p>Satu baris mewakili satu masa rumah tangga dalam catatan tagihan tahun {report.year}.</p>
        </div>
        <span className="household-matrix-count" role="status">
          {integerFormat.format(visibleRows.length)} dari {integerFormat.format(report.householdMatrix.length)} rumah tangga
        </span>
      </div>

      <div className="household-matrix-controls">
        <label className="household-matrix-search">
          <span>Cari nomor rumah atau nama warga</span>
          <input
            type="search"
            value={search}
            onChange={changeSearch}
            placeholder="Contoh: A-03 atau nama warga"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Filter status</span>
          <select value={filter} onChange={changeFilter}>
            <option value="all">Semua rumah</option>
            <option value="arrears">Ada tunggakan</option>
            <option value="pending">Menunggu verifikasi</option>
            <option value="paid">Lunas pada satu bulan atau lebih</option>
            <option value="unpaid">Belum dibayar</option>
          </select>
        </label>
        <label>
          <span>Urutkan</span>
          <select value={sort} onChange={changeSort}>
            <option value="house_number">Nomor rumah</option>
            <option value="name">Nama warga</option>
            <option value="arrears">Tunggakan terbanyak</option>
            <option value="paid_months">Bulan lunas terbanyak</option>
            <option value="latest_payment">Pembayaran terbaru</option>
          </select>
        </label>
        <button
          className="household-matrix-direction"
          type="button"
          aria-label={`Ubah arah urutan saat ini ${direction === "asc" ? "menaik" : "menurun"}`}
          onClick={() => setDirection((current) => current === "asc" ? "desc" : "asc")}
        >
          {direction === "asc" ? "Naik ↑" : "Turun ↓"}
        </button>
      </div>

      <ul className="household-matrix-legend" aria-label="Legenda status matriks">
        <li className="is-paid">Lunas</li>
        <li className="is-pending">Menunggu verifikasi</li>
        <li className="is-overdue">Tunggakan</li>
        <li className="is-unpaid">Belum bayar</li>
        <li className="is-waived">Dibebaskan</li>
        <li className="is-upcoming">Belum jatuh tempo</li>
        <li className="is-not-due">Tidak ada kewajiban</li>
        <li className="is-no_data">Data belum tersedia</li>
      </ul>

      {report.householdMatrix.length === 0 ? (
        <div className="chairman-report-empty" role="status">
          <div>
            <strong>Belum ada data tagihan rumah tangga untuk {report.year}.</strong>
            <p>Matriks hanya menampilkan kewajiban yang tercatat pada laporan RT ini.</p>
          </div>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="chairman-report-empty chairman-report-empty--compact" role="status">
          <div>
            <strong>Tidak ada rumah yang sesuai dengan pencarian dan filter ini.</strong>
            <p>Ubah kata pencarian atau pilih status yang lain.</p>
          </div>
        </div>
      ) : (
        <>
          <p id="household-matrix-scroll-hint" className="household-matrix-scroll-hint">
            Di layar kecil, geser tabel ke samping untuk melihat semua bulan.
          </p>
          <div className="household-matrix-scroll" role="region" aria-label="Matriks Januari sampai Desember" aria-describedby="household-matrix-scroll-hint" tabIndex={0}>
            <table className="household-matrix-table">
              <thead>
                <tr>
                  <th className="household-matrix-house-column" scope="col">Rumah tangga</th>
                  {monthAbbreviations.map((month, index) => (
                    <th scope="col" key={month} aria-label={monthNames[index]}>{month}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    <th className="household-matrix-house-column" scope="row">
                      <strong>Rumah {row.houseNumber}{row.houseLabel ? ` · ${row.houseLabel}` : ""}</strong>
                      <span>{row.residentNames.length > 0 ? row.residentNames.join(", ") : "Nama warga belum tercatat"}</span>
                      <small>{row.lifecycle === "active" ? "Aktif" : "Riwayat"} · {dateLabel(row.startsOn)}{row.endsOn ? ` – ${dateLabel(row.endsOn)}` : " – sekarang"}</small>
                    </th>
                    {row.months.map((cell, index) => {
                      const status = householdMatrixDisplayStatus(cell, report.asOf.businessDate);
                      const selected = selectedCell?.rowKey === row.key && selectedCell.month === cell.month;
                      const monthName = monthNames[index] ?? `Bulan ${cell.month}`;
                      const accessibleLabel = `Rumah ${row.houseNumber}, ${monthName} ${report.year}, ${statusLabels[status]}, sisa ${rupiah(cell.outstanding)}.`;
                      return (
                        <td key={cell.month}>
                          <button
                            type="button"
                            className={`household-matrix-cell is-${status}${selected ? " is-selected" : ""}`}
                            aria-label={accessibleLabel}
                            aria-pressed={selected}
                            onClick={() => setSelectedCell(selected ? null : { rowKey: row.key, month: cell.month })}
                          >
                            <span>{statusLabels[status]}</span>
                            {cell.status !== "no_data" && cell.status !== "not_due" && <small>{cellAmount(cell)}</small>}
                            {cell.pending && cell.overdue && <small className="household-matrix-cell-note">Tunggakan</small>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedRow && selectedMonth && selectedStatus && (
        <article className="household-matrix-detail" aria-live="polite">
          <div className="household-matrix-detail-heading">
            <div>
              <p className="eyebrow">RINCIAN BULAN · BACA SAJA</p>
              <h3>Rumah {selectedRow.houseNumber} · {monthNames[selectedMonth.month - 1]} {report.year}</h3>
              <p>{selectedRow.residentNames.length > 0 ? selectedRow.residentNames.join(", ") : "Nama warga belum tercatat"}</p>
            </div>
            <span className={`household-matrix-status is-${selectedStatus}`}>{statusLabels[selectedStatus]}</span>
          </div>

          {selectedMonth.dueDate && <p className="household-matrix-detail-note">Jatuh tempo {dateLabel(selectedMonth.dueDate)}.</p>}
          {selectedMonth.pending && selectedMonth.outstanding > 0 && (
            <p className="chairman-report-household-pending">
              {periodStatusDescription(selectedMonth, report.asOf.businessDate)} Jumlah ini belum dihitung sebagai pembayaran diterima.
            </p>
          )}
          {(selectedMonth.status === "no_data" || selectedMonth.status === "not_due") ? (
            <p className="household-matrix-detail-note">
              {selectedMonth.status === "not_due" ? "Rumah tangga ini tidak memiliki kewajiban pada bulan ini." : "Belum ada baris tagihan untuk bulan ini."}
            </p>
          ) : (
            <>
              {!selectedMonth.pending && selectedMonth.status === "unpaid" && (
                <p className="household-matrix-detail-note">{periodStatusDescription(selectedMonth, report.asOf.businessDate)}</p>
              )}
              <dl className="household-matrix-detail-metrics">
                <div><dt>Target awal</dt><dd>{rupiah(selectedMonth.target)}</dd></div>
                <div><dt>Target efektif</dt><dd>{rupiah(selectedMonth.effectiveTarget)}</dd></div>
                <div><dt>Diterima terverifikasi</dt><dd>{rupiah(selectedMonth.received)}</dd></div>
                <div><dt>Saldo awal impor</dt><dd>{rupiah(selectedMonth.openingBalanceReceived)}</dd></div>
                <div><dt>Transfer</dt><dd>{rupiah(selectedMonth.transferReceived)}</dd></div>
                <div><dt>Tunai</dt><dd>{rupiah(selectedMonth.cashReceived)}</dd></div>
                <div><dt>Dibebaskan</dt><dd>{rupiah(selectedMonth.waived)}</dd></div>
                <div><dt>Sisa kewajiban</dt><dd>{rupiah(selectedMonth.outstanding)}</dd></div>
              </dl>
              <p className="household-matrix-detail-note">
                Pembayaran terverifikasi terbaru pada bulan ini: {timestampLabel(selectedMonth.latestPaymentAt)}
              </p>
            </>
          )}
        </article>
      )}
    </section>
  );
}
