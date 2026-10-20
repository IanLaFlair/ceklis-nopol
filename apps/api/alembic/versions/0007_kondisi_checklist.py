"""Kondisi per bagian (Mulus/Penyok/Lecet) menggantikan centang

Revision ID: 0007
"""
import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"


def upgrade() -> None:
    op.add_column("transaction_checks", sa.Column("condition", sa.String(32)))


def downgrade() -> None:
    op.drop_column("transaction_checks", "condition")
