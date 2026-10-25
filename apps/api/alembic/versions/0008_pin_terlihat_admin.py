"""PIN petugas tersimpan terenkripsi supaya admin bisa melihatnya lagi

Revision ID: 0008
"""
import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"


def upgrade() -> None:
    op.add_column("users", sa.Column("pin_encrypted", sa.Text()))


def downgrade() -> None:
    op.drop_column("users", "pin_encrypted")
