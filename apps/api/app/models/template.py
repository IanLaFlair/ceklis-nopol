from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(String(120))

    versions: Mapped[list["TemplateVersion"]] = relationship(
        back_populates="template", order_by="TemplateVersion.version"
    )

    @property
    def latest(self) -> "TemplateVersion | None":
        return self.versions[-1] if self.versions else None


class TemplateVersion(Base):
    __tablename__ = "template_versions"
    __table_args__ = (UniqueConstraint("template_id", "version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("checklist_templates.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    config: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    template: Mapped[ChecklistTemplate] = relationship(back_populates="versions")
