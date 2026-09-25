import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models, realtime  # noqa: F401  (models registers the tables on Base.metadata)
from .config import get_settings
from .database import Base, engine
from .errors import AppError, app_error_handler
from .routers import meetings, users
from .seed import seed_if_empty

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    if settings.seed_on_startup:
        seed_if_empty()
    sweeper = asyncio.create_task(realtime.run_abandoned_meeting_sweeper())
    yield
    sweeper.cancel()
    with suppress(asyncio.CancelledError):
        await sweeper


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(AppError, app_error_handler)

app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(realtime.router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
