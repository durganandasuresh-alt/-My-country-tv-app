import unittest
import importlib
import json

# Import app from "tv app.py"
tv_app = importlib.import_module("tv app")
app = tv_app.app

class TestSubscriptionSystem(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.test_uid = "test_user_freeplan_2026"

    def test_01_plans_api_returns_free_plan_and_monthly_plans(self):
        """Verify API provides 10 Days Free Plan (10,000 channels) and Monthly Plans."""
        res = self.client.get("/api/subscription/plans")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["free_trial_days"], 10)

        # Free Plan verification
        free_plan = data["free_plan"]
        self.assertEqual(free_plan["id"], "free_trial")
        self.assertEqual(free_plan["price"], 0)
        self.assertEqual(free_plan["duration_days"], 10)
        self.assertEqual(free_plan["channels_unlocked"], 10000)

        # Monthly Plans verification
        monthly_plans = data["monthly_plans"]
        plan_ids = [p["id"] for p in monthly_plans]
        self.assertIn("1m", plan_ids)
        self.assertIn("3m", plan_ids)
        self.assertIn("1y", plan_ids)

        plan_1m = next(p for p in monthly_plans if p["id"] == "1m")
        self.assertEqual(plan_1m["price"], 99)
        self.assertEqual(plan_1m["duration_days"], 30)

    def test_02_new_user_gets_10_days_free_plan(self):
        """New user is automatically registered with 10 Days Free Plan with 10,000 channels."""
        # Reset test user to clean state
        self.client.post("/api/subscription/reset-trial", json={"user_id": self.test_uid, "action": "reset"})

        res = self.client.get(f"/api/subscription/status?user_id={self.test_uid}")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        sub = data["subscription"]

        self.assertTrue(sub["is_active"])
        self.assertTrue(sub["is_trial"])
        self.assertEqual(sub["trial_days_left"], 10)
        self.assertEqual(sub["plan"], "free_trial")
        self.assertEqual(sub["plan_name"], "10 Days Free Plan")
        self.assertEqual(sub["channels_unlocked"], 10000)

    def test_03_channels_unlocked_during_free_plan(self):
        """During the 10 Days Free Plan, all 10,000+ channels are unlocked."""
        self.client.post("/api/subscription/reset-trial", json={"user_id": self.test_uid, "action": "reset"})

        res = self.client.get(f"/api/channels?user_id={self.test_uid}")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["subscription"]["is_active"])

        # Check that channels are not locked
        locked_channels = [c for c in data["channels"] if c.get("is_locked")]
        self.assertEqual(len(locked_channels), 0, "No channels should be locked during the active 10 Days Free Plan")

    def test_04_expiration_after_10_days_locks_channels(self):
        """After 10 days, free plan expires and user must buy a monthly plan."""
        # Simulate 10 days expiration
        res = self.client.post("/api/subscription/reset-trial", json={"user_id": self.test_uid, "action": "expire"})
        self.assertEqual(res.status_code, 200)
        sub = res.get_json()["subscription"]

        self.assertFalse(sub["is_active"])
        self.assertEqual(sub["plan"], "expired")
        self.assertTrue(sub.get("requires_monthly_plan"))

        # Verify channels are now locked (except free news channels)
        res_ch = self.client.get(f"/api/channels?user_id={self.test_uid}")
        data_ch = res_ch.get_json()
        non_free_channels = [c for c in data_ch["channels"] if not c.get("is_free")]
        for c in non_free_channels[:10]:
            self.assertTrue(c["is_locked"], f"Channel {c.get('name')} should be locked after free plan expires")

    def test_05_stream_proxy_blocks_when_free_plan_expired(self):
        """Stream proxy returns 403 requiring monthly plan when 10 days trial has ended."""
        self.client.post("/api/subscription/reset-trial", json={"user_id": self.test_uid, "action": "expire"})

        # Pick a non-free channel stream
        channels = tv_app.CHANNELS_CACHE
        non_free_ch = next((c for c in channels if not tv_app.is_channel_free(c)), None)
        if non_free_ch:
            stream_url = non_free_ch["stream_url"]
            res = self.client.get(f"/proxy/stream?url={stream_url}&user_id={self.test_uid}")
            self.assertEqual(res.status_code, 403)
            data = res.get_json()
            self.assertIn("10 Days Free Plan has ended", data["message"])
            self.assertIn("monthly plan", data["message"].lower())

    def test_06_buying_monthly_plan_unlocks_all_channels(self):
        """Buying 1 Month Monthly Plan (₹99) unlocks all 10,000+ channels."""
        # Create payment for 1 Month (1m: ₹99)
        res_pay = self.client.post("/api/subscription/create-payment", json={
            "user_id": self.test_uid,
            "plan_id": "1m"
        })
        self.assertEqual(res_pay.status_code, 200)
        pay_data = res_pay.get_json()
        payment_id = pay_data["payment_id"]
        self.assertEqual(pay_data["plan"]["price"], 99)

        # Confirm payment
        res_confirm = self.client.post("/api/subscription/confirm-payment", json={
            "user_id": self.test_uid,
            "payment_id": payment_id,
            "plan_id": "1m",
            "upi_ref": "UPI-TEST-1MONTH-SUCCESS"
        })
        self.assertEqual(res_confirm.status_code, 200)
        sub = res_confirm.get_json()["subscription"]

        self.assertTrue(sub["is_active"])
        self.assertFalse(sub["is_trial"])
        self.assertEqual(sub["plan"], "1m")
        self.assertGreaterEqual(sub["days_left"], 29)

        # Channels are now all unlocked again!
        res_ch = self.client.get(f"/api/channels?user_id={self.test_uid}")
        data_ch = res_ch.get_json()
        locked = [c for c in data_ch["channels"] if c.get("is_locked")]
        self.assertEqual(len(locked), 0, "All channels must be unlocked after buying monthly plan")

if __name__ == "__main__":
    unittest.main()
