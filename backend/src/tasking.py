from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.exc import InterfaceError, OperationalError

RETRYABLE_EXCEPTIONS = (
    OperationalError,
    InterfaceError,
    RedisConnectionError,
    ConnectionError,
)
