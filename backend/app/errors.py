"""Domain errors with stable machine readable codes the frontend can branch on."""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class MeetingNotFound(AppError):
    def __init__(self) -> None:
        super().__init__(404, "MEETING_NOT_FOUND", "This meeting ID is not valid. Please check and try again.")


class NotMeetingHost(AppError):
    def __init__(self) -> None:
        super().__init__(403, "NOT_HOST", "Only the host can perform this action.")


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": {"code": exc.code, "message": exc.message}})
