import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel import auth  # noqa: E402


def call(app, method, path, body=None, cookie="", ):
    from flightintel.webapp import dispatch
    headers = {"host": "localhost:1", "cookie": cookie}
    code, ctype, data, extra = dispatch(app, method, path, headers, json.dumps(body).encode() if body is not None else b"", None, static=False)
    return code, json.loads(data), dict(extra)


class AuthFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        os.environ["FI_DB"] = str(Path(cls.tmp) / "t.sqlite")
        os.environ["FI_SESSION_SECRET"] = "test-secret-" + "x" * 20
        os.environ["FI_USERS"] = json.dumps({
            "ana": {"name": "Ana", "hash": auth.hash_password("pw-ana-1"), "owner": True},
            "bia": {"name": "Bia", "hash": auth.hash_password("pw-bia-2")}})
        from flightintel.webapp import App
        cls.app = App(False)

    @classmethod
    def tearDownClass(cls):
        for k in ("FI_DB", "FI_SESSION_SECRET", "FI_USERS"):
            os.environ.pop(k, None)

    def login(self, user, pw):
        code, body, extra = call(self.app, "POST", "/api/login", {"username": user, "password": pw})
        return code, extra.get("Set-Cookie", "").split(";")[0]

    def test_password_hash_roundtrip_and_no_plaintext(self):
        h = auth.hash_password("secret")
        self.assertTrue(auth.verify_password("secret", h))
        self.assertFalse(auth.verify_password("Secret", h))
        self.assertNotIn("secret", h)

    def test_api_requires_login(self):
        self.assertEqual(call(self.app, "GET", "/api/state")[0], 401)
        self.assertEqual(call(self.app, "GET", "/api/meta")[0], 401)
        self.assertEqual(call(self.app, "GET", "/api/session")[0], 401)

    def test_wrong_password_and_forged_cookie_are_rejected(self):
        self.assertEqual(self.login("ana", "nope")[0], 401)
        self.assertEqual(self.login("ghost", "pw-ana-1")[0], 401)
        self.assertEqual(call(self.app, "GET", "/api/state", cookie="fi_session=ana.9999999999.forged")[0], 401)

    def test_each_user_has_their_own_memory_and_can_only_read_the_other(self):
        _, ana = self.login("ana", "pw-ana-1")
        _, bia = self.login("bia", "pw-bia-2")
        self.assertTrue(ana.startswith("fi_session="))
        self.assertEqual(call(self.app, "PUT", "/api/state", {"state": {"plans": "ana's trip"}}, ana)[0], 200)
        self.assertEqual(call(self.app, "PUT", "/api/state", {"state": {"plans": "bia's trip"}}, bia)[0], 200)
        _, mine, _ = call(self.app, "GET", "/api/state", cookie=bia)
        self.assertEqual(mine["state"], {"plans": "bia's trip"})
        self.assertFalse(mine["read_only"])
        _, theirs, _ = call(self.app, "GET", "/api/state?user=ana", cookie=bia)          # reading is allowed...
        self.assertEqual(theirs["state"], {"plans": "ana's trip"})
        self.assertTrue(theirs["read_only"])
        call(self.app, "PUT", "/api/state?user=ana", {"state": {"plans": "hijacked"}, "user": "ana"}, bia)   # ...writing someone else's is not
        _, still, _ = call(self.app, "GET", "/api/state", cookie=ana)
        self.assertEqual(still["state"], {"plans": "ana's trip"})
        self.assertEqual(call(self.app, "GET", "/api/state?user=nobody", cookie=ana)[0], 400)

    def test_session_endpoint_and_logout(self):
        _, ana = self.login("ana", "pw-ana-1")
        code, body, _ = call(self.app, "GET", "/api/session", cookie=ana)
        self.assertEqual((code, body["user"]["id"], body["user"]["owner"]), (200, "ana", True))
        self.assertEqual({u["id"] for u in body["users"]}, {"ana", "bia"})
        _, _, extra = call(self.app, "POST", "/api/logout", {}, ana)
        self.assertIn("Max-Age=0", extra["Set-Cookie"])


if __name__ == "__main__":
    unittest.main()
