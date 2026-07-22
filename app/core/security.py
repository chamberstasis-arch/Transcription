"""Autenticación y utilidades de seguridad del backend.

Modelo: si `API_KEYS` (CSV) está vacío, la autenticación está deshabilitada y la
API queda en modo local abierto. Si tiene una o más claves, los `/api/*` (salvo
rutas públicas) exigen autenticación, que puede presentarse de dos formas:

- Cookie de sesión httpOnly (la usa el frontend tras hacer login). El token es
  stateless: va firmado con HMAC y lleva su expiración, así que no hay store de
  sesiones que mantener ni que se pierda al reiniciar.
- Header `X-API-Key` con una clave válida (clientes programáticos: curl, scripts).

Comparaciones timing-safe en ambos casos.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

API_KEY_HEADER = "X-API-Key"
SESSION_COOKIE = "transcriptor_session"

# Rutas /api que nunca requieren autenticación.
PUBLIC_API_PATHS = frozenset({"/api/health", "/api/auth/login", "/api/auth/status"})


def _split_csv(raw: str | None) -> list[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def configured_api_keys() -> list[str]:
    return _split_csv(os.getenv("API_KEYS"))


def auth_enabled() -> bool:
    return len(configured_api_keys()) > 0


def is_valid_api_key(provided: str | None) -> bool:
    """Compara la clave contra las configuradas en tiempo constante.

    Devuelve True si la auth está deshabilitada (no hay claves).
    """
    keys = configured_api_keys()
    if not keys:
        return True
    candidate = provided or ""
    result = False
    for key in keys:
        if secrets.compare_digest(candidate, key):
            result = True
    return result


# --- Sesión firmada (stateless) -------------------------------------------------

def _session_secret() -> bytes:
    """Secreto para firmar sesiones.

    Usa `SESSION_SECRET` si está definido; si no, lo deriva de las API keys, de
    modo que rotar las claves invalida todas las sesiones existentes.
    """
    explicit = os.getenv("SESSION_SECRET")
    if explicit:
        return explicit.encode()
    basis = "transcriptor-session::" + ",".join(configured_api_keys())
    return hashlib.sha256(basis.encode()).digest()


def session_ttl_seconds() -> int:
    try:
        hours = int(os.getenv("SESSION_TTL_HOURS", "168"))  # 7 días
    except ValueError:
        hours = 168
    return max(1, hours) * 3600


def cookie_secure() -> bool:
    # En túnel SSH / Tailscale el transporte ya va cifrado sobre HTTP, por eso el
    # default es False. Pon COOKIE_SECURE=true si sirves por HTTPS.
    return os.getenv("COOKIE_SECURE", "false").lower() == "true"


def cookie_samesite() -> str:
    value = os.getenv("COOKIE_SAMESITE", "lax").lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _sign(message: str) -> str:
    return _b64e(hmac.new(_session_secret(), message.encode(), hashlib.sha256).digest())


def create_session_token() -> str:
    payload = {"exp": int(time.time()) + session_ttl_seconds(), "n": secrets.token_urlsafe(8)}
    message = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    return f"{message}.{_sign(message)}"


def verify_session_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    message, _, signature = token.partition(".")
    if not secrets.compare_digest(signature, _sign(message)):
        return False
    try:
        payload = json.loads(_b64d(message))
    except Exception:
        return False
    return int(payload.get("exp", 0)) > int(time.time())


# --- Decisión de acceso ---------------------------------------------------------

def requires_auth(path: str, method: str) -> bool:
    """True si la petición debe presentar credenciales válidas."""
    if not auth_enabled():
        return False
    if method == "OPTIONS":  # preflight CORS
        return False
    if not path.startswith("/api/"):
        return False
    return path not in PUBLIC_API_PATHS


def is_authenticated(session_cookie: str | None, api_key_header: str | None) -> bool:
    """True si la request trae una sesión válida o una API key válida."""
    if not auth_enabled():
        return True
    if verify_session_token(session_cookie):
        return True
    if api_key_header and is_valid_api_key(api_key_header):
        return True
    return False


# --- CORS / límites -------------------------------------------------------------

def cors_allow_origins() -> list[str]:
    """Orígenes permitidos para CORS (CSV). Cae a `FRONTEND_ORIGIN`. Nunca `*`.

    Con el front servido same-origin desde el backend, CORS deja de intervenir;
    esto solo aplica si se sirve el front desde otro origen.
    """
    origins = _split_csv(os.getenv("CORS_ALLOW_ORIGINS"))
    if origins:
        return origins
    legacy = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    return _split_csv(legacy) or ["http://localhost:5173"]


def max_upload_bytes() -> int:
    """Límite de tamaño para subidas (`MAX_UPLOAD_MB`, default 200 MB)."""
    try:
        mb = int(os.getenv("MAX_UPLOAD_MB", "200"))
    except ValueError:
        mb = 200
    return max(1, mb) * 1024 * 1024
