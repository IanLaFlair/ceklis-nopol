"""M1: klien, user, sesi

Revision ID: 0001
"""
import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("staff_code", sa.String(32), unique=True),
        sa.Column("phone", sa.String(32), unique=True),
        sa.Column("email", sa.String(254), unique=True),
        sa.Column("pin_hash", sa.String(100)),
        sa.Column("password_hash", sa.String(100)),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("last_active_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('super_admin','client_admin','supervisor','petugas')", name="ck_users_role"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device", sa.String(300)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("sessions")
    op.drop_table("users")
    op.drop_table("clients")
