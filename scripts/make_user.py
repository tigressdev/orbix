"""Create or update a user entry (password hash only) in config/users.local.json, and print the FI_USERS value for Vercel.

    python scripts/make_user.py helen "Helen" --owner          # prompts for the password (not echoed)
    python scripts/make_user.py demetrio "Demetrio"

Never commit config/users.local.json. On Vercel set FI_USERS (JSON, same shape) and FI_SESSION_SECRET (any long random string).
"""
import argparse
import getpass
import json
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flightintel.auth import hash_password  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("login")
    p.add_argument("name")
    p.add_argument("--owner", action="store_true", help="owner of the trip configuration (sees the purchased ticket)")
    p.add_argument("--password", help="avoid: it ends up in your shell history; omit to be prompted")
    a = p.parse_args()
    password = a.password or getpass.getpass(f"Password for {a.login}: ")
    f = ROOT / "config/users.local.json"
    users = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    users[a.login.lower()] = {"name": a.name, "hash": hash_password(password), **({"owner": True} if a.owner else {})}
    f.write_text(json.dumps(users, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"saved {a.login} in {f.relative_to(ROOT)}")
    print("\nVercel -> Settings -> Environment Variables:")
    print("  FI_USERS =", json.dumps(users, ensure_ascii=False, separators=(",", ":")))
    print("  FI_SESSION_SECRET =", secrets.token_hex(32), " (generate once, keep it)")


if __name__ == "__main__":
    main()
