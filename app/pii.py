from __future__ import annotations

import hashlib
import re

PII_PATTERNS: dict[str, str] = {
    "email": r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b",

    "phone_vn": (
        r"(?<!\d)"
        r"(?:\+84|0)"
        r"(?:[ .-]?\d){9}"
        r"(?!\d)"
    ),

    "cccd": r"(?<!\d)\d{12}(?!\d)",

    "credit_card": (
        r"(?<!\d)"
        r"(?:\d{4}[- ]?){3}\d{4}"
        r"(?!\d)"
    ),

    "passport": r"(?<![A-Z0-9])[A-Z]\d{7}(?![A-Z0-9])",

    "address_vn": (
        r"(?ix)"
        r"(?:"
            # Case 1: Có prefix Địa chỉ / Thường trú / ...
            r"(?<!\w)"
            r"(?:"
                r"địa\s*chỉ|dia\s*chi|"
                r"nơi\s*ở|noi\s*o|"
                r"thường\s*trú|thuong\s*tru|"
                r"tạm\s*trú|tam\s*tru|"
                r"đ/c"
            r")"
            r"\s*[:=\-]?\s*"
            r"[^\r\n;]{5,200}"

            r"|"

            # Case 2: Địa chỉ tự do, không có prefix
            r"(?<!\w)"

            # Số nhà: 123, 123A, 123/4, 123/4/5A...
            r"\d{1,5}[A-Z]?"
            r"(?:/\d{1,5}[A-Z]?){0,4}"

            r"\s*[,.\-]?\s*"

            # Thành phần sau số nhà
            r"(?:"
                # Đường / phố
                r"(?:đường|duong|phố|pho)\s+"
                r"[^,\r\n;]{1,60}"

                r"|"

                # Khu phố / KP
                r"(?:khu\s*phố|khu\s*pho|kp\.?)\s*"
                r"[A-Z0-9À-ỹ\- ]{1,30}"

                r"|"

                # Ấp / thôn / tổ
                r"(?:ấp|ap|thôn|thon|tổ|to)\s*"
                r"[A-Z0-9À-ỹ\- ]{1,30}"
            r")"

            # Các phần địa giới phía sau
            r"(?:"
                r"\s*[,.\-]\s*"
                r"(?:"
                    r"phường|phuong|p\.?|"
                    r"xã|xa|"
                    r"quận|quan|q\.?|"
                    r"huyện|huyen|"
                    r"thành\s*phố|thanh\s*pho|tp\.?|"
                    r"tỉnh|tinh"
                r")"
                r"\s*"
                r"[^,\r\n;]{1,50}"
            r"){1,4}"
        r")"
    ),
}


def scrub_text(text: str) -> str:
    safe = text
    for name, pattern in PII_PATTERNS.items():
        safe = re.sub(pattern, f"[REDACTED_{name.upper()}]", safe)
    return safe


def summarize_text(text: str, max_len: int = 80) -> str:
    safe = scrub_text(text).strip().replace("\n", " ")
    return safe[:max_len] + ("..." if len(safe) > max_len else "")


def hash_user_id(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:12]
