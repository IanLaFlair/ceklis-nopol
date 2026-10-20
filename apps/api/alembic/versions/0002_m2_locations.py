"""M2: lokasi, pos, penugasan, activity log

Revision ID: 0002
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.create_table(
        "sites",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.Text),
    )
    op.create_table(
        "posts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("site_id", sa.Integer, sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_id", sa.Integer, sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_on_post", sa.String(20), nullable=False, server_default="petugas"),
        sa.Column("shift_name", sa.String(40)),
        sa.Column("shift_start", sa.Time),
        sa.Column("shift_end", sa.Time),
        sa.Column("valid_from", sa.Date),
        sa.Column("valid_to", sa.Date),
        sa.CheckConstraint("role_on_post IN ('petugas','supervisor')", name="ck_assignments_role"),
    )
    op.create_index("ix_assignments_user_id", "assignments", ["user_id"])
    op.create_index("ix_assignments_post_id", "assignments", ["post_id"])
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("entity", sa.String(40), nullable=False),
        sa.Column("entity_id", sa.Integer),
        sa.Column("site_id", sa.Integer, sa.ForeignKey("sites.id")),
        sa.Column("post_id", sa.Integer, sa.ForeignKey("posts.id")),
        sa.Column("meta", JSONB),
        sa.Column("device", sa.String(300)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_activity_logs_created", "activity_logs", [sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_table("activity_logs")
    op.drop_table("assignments")
    op.drop_table("posts")
    op.drop_table("sites")
