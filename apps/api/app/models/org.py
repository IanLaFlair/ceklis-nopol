from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

ROLES = ("super_admin", "client_admin", "supervisor", "petugas")
ADMIN_ROLES = ("super_admin", "client_admin", "supervisor")


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))

    sites: Mapped[list["Site"]] = relationship(back_populates="client", order_by="Site.name")


class Site(Base):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("checklist_templates.id"))

    client: Mapped[Client] = relationship(back_populates="sites")
    posts: Mapped[list["Post"]] = relationship(back_populates="site", order_by="Post.name")


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    site: Mapped[Site] = relationship(back_populates="posts")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    staff_code: Mapped[str | None] = mapped_column(String(32), unique=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True)
    pin_hash: Mapped[str | None] = mapped_column(String(100))
    password_hash: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    assignments: Mapped[list["Assignment"]] = relationship(back_populates="user")


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    role_on_post: Mapped[str] = mapped_column(String(20), default="petugas")
    shift_name: Mapped[str | None] = mapped_column(String(40))
    shift_start: Mapped[time | None] = mapped_column(Time)
    shift_end: Mapped[time | None] = mapped_column(Time)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)

    user: Mapped[User] = relationship(back_populates="assignments")
    post: Mapped[Post] = relationship()


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    device: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()
