"""M3: template checklist + versi

Revision ID: 0003
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    op.create_table(
        "checklist_templates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id")),
        sa.Column("name", sa.String(120), nullable=False),
    )
    op.create_table(
        "template_versions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("template_id", sa.Integer, sa.ForeignKey("checklist_templates.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("config", JSONB, nullable=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("template_id", "version"),
    )
    op.add_column("sites", sa.Column("template_id", sa.Integer, sa.ForeignKey("checklist_templates.id")))


def downgrade() -> None:
    op.drop_column("sites", "template_id")
    op.drop_table("template_versions")
    op.drop_table("checklist_templates")
