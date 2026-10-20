from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from app.routers import (
    admin,
    admin_org,
    admin_templates,
    auth,
    me,
    plates,
    reports,
    transactions,
    uploads,
)
from app.services import storage


@asynccontextmanager
async def lifespan(_: FastAPI):
    storage.ensure_bucket()
    yield


app = FastAPI(title="Ceklis API", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")

api = APIRouter(prefix="/api")
for r in (auth, me, transactions, uploads, plates, admin, admin_org, admin_templates, reports):
    api.include_router(r.router)


@api.get("/health", tags=["meta"])
def health():
    return {"ok": True}


app.include_router(api)
