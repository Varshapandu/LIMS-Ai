"""Quick security verification tests."""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"


def test_endpoint(label, url, token=None):
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        r = urllib.request.urlopen(req)
        data = json.loads(r.read())
        print(f"  {label}: {r.status} OK")
        return data
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        print(f"  {label}: {e.code} — {body.get('detail', body)}")
        return None


print("=== 1. Health (public) ===")
test_endpoint("GET /health", f"{BASE}/health")

print("\n=== 2. Protected routes WITHOUT token (should be 401/403) ===")
test_endpoint("GET /api/dashboard/overview", f"{BASE}/api/dashboard/overview")
test_endpoint("GET /api/billing/invoices/X", f"{BASE}/api/billing/invoices/X")
test_endpoint("GET /api/specimens/worklist", f"{BASE}/api/specimens/worklist")
test_endpoint("GET /api/results/worklist", f"{BASE}/api/results/worklist")
test_endpoint("GET /api/catalog/tests", f"{BASE}/api/catalog/tests")
test_endpoint("GET /api/search/worklist", f"{BASE}/api/search/worklist")
test_endpoint("GET /api/reports/analytics", f"{BASE}/api/reports/analytics")
test_endpoint("GET /api/reference-ranges", f"{BASE}/api/reference-ranges")

print("\n=== 3. Login (should work without token) ===")
login_data = json.dumps({"email": "admin@ailims.com", "password": "admin123"}).encode()
req = urllib.request.Request(f"{BASE}/api/auth/login", data=login_data, method="POST")
req.add_header("Content-Type", "application/json")
try:
    r = urllib.request.urlopen(req)
    login_resp = json.loads(r.read())
    token = login_resp["access_token"]
    print(f"  Login: {r.status} OK — got token ({len(token)} chars)")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    print(f"  Login: {e.code} — {body}")
    token = None

if token:
    print("\n=== 4. Protected routes WITH valid token (should be 200) ===")
    test_endpoint("GET /api/dashboard/overview", f"{BASE}/api/dashboard/overview", token)
    test_endpoint("GET /api/specimens/worklist", f"{BASE}/api/specimens/worklist", token)
    test_endpoint("GET /api/results/worklist", f"{BASE}/api/results/worklist", token)
    test_endpoint("GET /api/catalog/tests", f"{BASE}/api/catalog/tests", token)
    test_endpoint("GET /api/search/worklist", f"{BASE}/api/search/worklist", token)
    test_endpoint("GET /api/reports/analytics", f"{BASE}/api/reports/analytics", token)
    test_endpoint("GET /api/reference-ranges", f"{BASE}/api/reference-ranges", token)
else:
    print("\n  Skipping authenticated tests — no token obtained.")

print("\n=== DONE ===")
