"""M9: tandai foto yang sudah dihapus oleh retensi

Revision ID: 0006
"""
import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    op.add_column("photos", sa.Column("deleted_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("photos", "deleted_at")
