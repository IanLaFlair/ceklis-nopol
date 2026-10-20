"""M4: transaksi check in, checklist, barang, foto

Revision ID: 0004
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    op.create_table(
        "vehicles",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("plate_normalized", sa.String(20), nullable=False, unique=True),
        sa.Column("plate_display", sa.String(20), nullable=False),
        sa.Column("make_model", sa.String(120)),
        sa.Column("color", sa.String(40)),
        sa.Column("type", sa.String(40)),
    )
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id_uuid", sa.Uuid, nullable=False, unique=True),
        sa.Column("post_id", sa.Integer, sa.ForeignKey("posts.id"), nullable=False),
        sa.Column("site_id", sa.Integer, sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("template_version_id", sa.Integer, sa.ForeignKey("template_versions.id"), nullable=False),
        sa.Column("template_snapshot", JSONB, nullable=False),
        sa.Column("plate", sa.String(20), nullable=False),
        sa.Column("plate_normalized", sa.String(20), nullable=False),
        sa.Column("vehicle_type", sa.String(40)),
        sa.Column("color", sa.String(40)),
        sa.Column("make_model", sa.String(120)),
        sa.Column("slot", sa.String(40)),
        sa.Column("key_tag", sa.String(40)),
        sa.Column("owner_phone", sa.String(32)),
        sa.Column("vip", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("ticket_code", sa.String(32), nullable=False, unique=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="parked"),
        sa.Column("checkin_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checkin_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("checkout_client_id", sa.Uuid, unique=True),
        sa.Column("checkout_at", sa.DateTime(timezone=True)),
        sa.Column("checkout_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text),
        sa.Column("checkout_notes", sa.Text),
        sa.Column("summary_text", sa.Text, nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('parked','incident_pending','incident_confirmed','released')", name="ck_transactions_status"
        ),
    )
    op.create_index("ix_transactions_post_status", "transactions", ["post_id", "status"])
    op.create_index("ix_transactions_plate", "transactions", ["plate_normalized"])
    op.create_index("ix_transactions_site_checkin", "transactions", ["site_id", sa.text("checkin_at DESC")])
    # Satu plat hanya boleh punya satu transaksi `parked` per lokasi (PRD §7)
    op.create_index("uq_transactions_parked_plate_site", "transactions", ["site_id", "plate_normalized"],
                    unique=True, postgresql_where=sa.text("status = 'parked'"))

    op.create_table(
        "transaction_checks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("transaction_id", sa.Integer, sa.ForeignKey("transactions.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("phase", sa.String(3), nullable=False),
        sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("label_snapshot", sa.String(120), nullable=False),
        sa.Column("group_snapshot", sa.String(120), nullable=False),
        sa.Column("checked", sa.Boolean, nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.CheckConstraint("phase IN ('in','out')", name="ck_transaction_checks_phase"),
    )
    op.create_table(
        "transaction_inside_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("transaction_id", sa.Integer, sa.ForeignKey("transactions.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("phase", sa.String(3), nullable=False),
        sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("present", sa.Boolean, nullable=False),
        sa.Column("extra_text", sa.Text),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.CheckConstraint("phase IN ('in','out')", name="ck_transaction_inside_items_phase"),
    )
    op.create_table(
        "photos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id_uuid", sa.Uuid, nullable=False, unique=True),
        sa.Column("transaction_id", sa.Integer, sa.ForeignKey("transactions.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("phase", sa.String(3), nullable=False),
        sa.Column("side", sa.String(10), nullable=False),
        sa.Column("item_id", sa.String(64)),
        sa.Column("object_key", sa.String(300), nullable=False, unique=True),
        sa.Column("thumb_key", sa.String(300)),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("phase IN ('in','out')", name="ck_photos_phase"),
        sa.CheckConstraint("side IN ('depan','belakang','kiri','kanan','detail')", name="ck_photos_side"),
    )


def downgrade() -> None:
    op.drop_table("photos")
    op.drop_table("transaction_inside_items")
    op.drop_table("transaction_checks")
    op.drop_table("transactions")
    op.drop_table("vehicles")
