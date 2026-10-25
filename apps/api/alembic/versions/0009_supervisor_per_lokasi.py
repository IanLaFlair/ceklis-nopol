"""Supervisor per lokasi: lihat semua pos di satu lokasi lewat dashboard

Revision ID: 0009
"""
import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"


def upgrade() -> None:
    op.add_column("users", sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True))
    op.create_index("ix_users_site_id", "users", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_users_site_id", table_name="users")
    op.drop_column("users", "site_id")
