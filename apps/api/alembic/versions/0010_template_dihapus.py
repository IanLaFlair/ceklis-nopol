"""Template bisa dihapus (diarsipkan; transaksi lama tetap menunjuk versinya)

Revision ID: 0010
"""
import sqlalchemy as sa

from alembic import op

revision = "0010"
down_revision = "0009"


def upgrade() -> None:
    op.add_column("checklist_templates", sa.Column("archived_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("checklist_templates", "archived_at")
