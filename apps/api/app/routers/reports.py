"""Laporan: rekap transaksi, durasi parkir, insiden — CSV & PDF (PRD §5 /admin/laporan)."""
import csv
import io
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, AdminUser
from app.core.timeutil import day_bounds, today, tz
from app.models import Incident, Transaction
from app.services import scope

router = APIRouter(prefix="/admin/reports", tags=["reports"])

STATUS_LABEL = {
    "parked": "Masih parkir", "incident_pending": "Menunggu supervisor",
    "incident_confirmed": "Kerusakan dicatat", "released": "Selesai",
}
INCIDENT_LABEL = {"pending": "Menunggu", "confirmed": "Kerusakan baru", "dismissed": "Tidak ada kerusakan"}


class Period:
    def __init__(self, scope_: str = Query("all", alias="scope"),
                 date_from: date | None = Query(None, alias="from"), date_to: date | None = Query(None, alias="to")):
        self.scope = scope_
        self.d_from, self.d_to, self.start, self.end = _range(date_from, date_to)


PeriodQ = Annotated[Period, Depends()]


def _range(date_from: date | None, date_to: date | None):
    d_to = date_to or today()
    d_from = date_from or d_to - timedelta(days=6)
    if d_from > d_to:
        raise HTTPException(422, "Tanggal awal setelah tanggal akhir")
    if (d_to - d_from).days > 366:
        raise HTTPException(422, "Rentang maksimal 1 tahun")
    return d_from, d_to, day_bounds(d_from)[0], day_bounds(d_to)[1]


def _txs(db, user, scope_, start, end):
    ids = scope.resolve_scope(db, user, scope_)
    stmt = (select(Transaction)
            .options(selectinload(Transaction.post), selectinload(Transaction.site),
                     selectinload(Transaction.checkin_user), selectinload(Transaction.checkout_user),
                     selectinload(Transaction.incidents))
            .where(Transaction.checkin_at >= start, Transaction.checkin_at < end)
            .order_by(Transaction.checkin_at))
    if ids is not None:
        stmt = stmt.where(Transaction.post_id.in_(ids or {-1}))
    return db.scalars(stmt).all()


def _fmt(dt) -> str:
    return dt.astimezone(tz()).strftime("%Y-%m-%d %H:%M") if dt else ""


def _minutes(tx) -> int | None:
    end = tx.released_at or tx.checkout_at
    return int((end - tx.checkin_at).total_seconds() // 60) if end else None


def _csv(name: str, header: list[str], rows) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("﻿")  # supaya Excel membaca UTF-8
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/transactions.csv")
def transactions_csv(user: AdminUser, db: DB, p: PeriodQ):
    rows = [[
        tx.ticket_code, tx.plate, tx.vehicle_type or "", tx.color or "", tx.make_model or "", tx.site.name,
        tx.post.name, tx.slot or "", tx.key_tag or "", _fmt(tx.checkin_at), tx.checkin_user.name,
        _fmt(tx.checkout_at), tx.checkout_user.name if tx.checkout_user else "", _minutes(tx) or "",
        STATUS_LABEL[tx.status], " ".join(i.code for i in tx.incidents), (tx.notes or "").replace("\n", " "),
    ] for tx in _txs(db, user, p.scope, p.start, p.end)]
    return _csv(f"ceklis-transaksi-{p.d_from}-{p.d_to}.csv", [
        "Tiket cek list", "Nomor polisi", "Jenis", "Warna", "Merek/model", "Lokasi", "Pos", "Slot", "Kunci",
        "Masuk", "Petugas masuk", "Keluar", "Petugas keluar", "Durasi (menit)", "Status", "Insiden", "Catatan",
    ], rows)


@router.get("/incidents.csv")
def incidents_csv(user: AdminUser, db: DB, p: PeriodQ):
    ids = scope.resolve_scope(db, user, p.scope)
    stmt = (select(Incident).join(Transaction)
            .options(selectinload(Incident.transaction).selectinload(Transaction.post),
                     selectinload(Incident.transaction).selectinload(Transaction.site),
                     selectinload(Incident.reporter), selectinload(Incident.decider))
            .where(Incident.created_at >= p.start, Incident.created_at < p.end).order_by(Incident.created_at))
    if ids is not None:
        stmt = stmt.where(Transaction.post_id.in_(ids or {-1}))
    rows = [[
        i.code, i.transaction.ticket_code, i.transaction.plate, i.transaction.site.name, i.transaction.post.name,
        _fmt(i.created_at), i.reporter.name, ", ".join(i.parts), (i.note or "").replace("\n", " "),
        INCIDENT_LABEL[i.status], i.decider.name if i.decider else "", _fmt(i.decided_at),
        (i.decision_note or "").replace("\n", " "),
    ] for i in db.scalars(stmt)]
    return _csv(f"ceklis-insiden-{p.d_from}-{p.d_to}.csv", [
        "Kode", "Tiket cek list", "Nomor polisi", "Lokasi", "Pos", "Dilaporkan", "Petugas", "Bagian",
        "Catatan petugas", "Keputusan", "Supervisor", "Diputuskan", "Catatan pemeriksaan",
    ], rows)


def _dur(m: int | None) -> str:
    if m is None:
        return "-"
    return f"{m // 60}j {m % 60}m" if m >= 60 else f"{m}m"


@router.get("/summary.pdf")
def summary_pdf(user: AdminUser, db: DB, p: PeriodQ):
    d_from, d_to = p.d_from, p.d_to
    txs = _txs(db, user, p.scope, p.start, p.end)
    durations = [m for m in (_minutes(t) for t in txs) if m is not None]
    incidents = [i for t in txs for i in t.incidents]

    by_loc: dict[tuple[str, str], list] = {}
    for t in txs:
        by_loc.setdefault((t.site.name, t.post.name), []).append(t)

    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title="Rekap Ceklis")
    ink, line, accent = colors.HexColor("#0E100F"), colors.HexColor("#DCDDD6"), colors.HexColor("#F5C518")

    def table(data, widths):
        t = Table(data, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ink), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.4, line), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F7F3")]),
        ]))
        return t

    story = [
        Paragraph("<b>ceklis</b> — Rekap transaksi", styles["Title"]),
        Paragraph(f"Periode {d_from:%d %b %Y} – {d_to:%d %b %Y}", styles["Normal"]),
        Spacer(1, 6 * mm),
    ]
    kpi = Table([
        ["Check in", "Selesai", "Masih di lokasi", "Insiden", "Rata-rata durasi"],
        [len(txs), sum(t.status == "released" for t in txs), sum(t.status != "released" for t in txs),
         len(incidents), _dur(sum(durations) // len(durations) if durations else None)],
    ], colWidths=[34 * mm] * 5)
    kpi.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), accent), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 14), ("GRID", (0, 0), (-1, -1), 0.4, line),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 1), (-1, 1), 6), ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
    ]))
    story += [kpi, Spacer(1, 6 * mm), Paragraph("<b>Per lokasi / pos</b>", styles["Heading3"])]
    loc_rows = [["Lokasi", "Pos", "Check in", "Selesai", "Insiden", "Rata-rata durasi"]]
    for (site, post), items in sorted(by_loc.items()):
        ds = [m for m in (_minutes(t) for t in items) if m is not None]
        loc_rows.append([site, post, len(items), sum(t.status == "released" for t in items),
                         sum(len(t.incidents) for t in items), _dur(sum(ds) // len(ds) if ds else None)])
    story.append(table(loc_rows, [52 * mm, 30 * mm, 20 * mm, 20 * mm, 18 * mm, 30 * mm]))

    if incidents:
        story += [Spacer(1, 6 * mm), Paragraph("<b>Insiden</b>", styles["Heading3"])]
        inc_rows = [["Kode", "Nomor polisi", "Tiket cek list", "Bagian", "Keputusan"]]
        for i in incidents:
            inc_rows.append([i.code, i.transaction.plate, i.transaction.ticket_code,
                             Paragraph(", ".join(i.parts) or "-", styles["BodyText"]), INCIDENT_LABEL[i.status]])
        story.append(table(inc_rows, [22 * mm, 28 * mm, 34 * mm, 56 * mm, 32 * mm]))

    story += [Spacer(1, 8 * mm), Paragraph(
        "Perbandingan kondisi adalah bahan pemeriksaan, bukan penetapan siapa yang bertanggung jawab.",
        styles["Italic"])]
    doc.build(story)
    return Response(buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="ceklis-rekap-{d_from}-{d_to}.pdf"'})
