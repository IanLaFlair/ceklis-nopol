"""M5: insiden check out

Revision ID: 0005
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id_uuid", sa.Uuid, nullable=False, unique=True),
        sa.Column("transaction_id", sa.Integer, sa.ForeignKey("transactions.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("parts", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("note", sa.Text),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reported_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("decided_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("decision", sa.String(20)),
        sa.Column("decision_note", sa.Text),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('pending','confirmed','dismissed')", name="ck_incidents_status"),
        sa.CheckConstraint("decision IS NULL OR decision IN ('no_damage','damage_confirmed')",
                           name="ck_incidents_decision"),
    )
    op.create_index("ix_incidents_status", "incidents", ["status"])
    op.add_column("photos", sa.Column("incident_id", sa.Integer,
                                      sa.ForeignKey("incidents.id", ondelete="SET NULL")))


def downgrade() -> None:
    op.drop_column("photos", "incident_id")
    op.drop_table("incidents")
