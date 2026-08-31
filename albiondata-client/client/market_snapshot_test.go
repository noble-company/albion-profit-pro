package client

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/ao-data/albiondata-client/lib"
)

func TestMarketUploadWithSnapshotAnnotatesAndDeduplicatesScopes(t *testing.T) {
	capturedAt := time.Date(2026, 8, 24, 12, 30, 0, 123000000, time.UTC)
	orders := []*lib.MarketOrder{
		{LocationID: "5003", ItemID: "T5_MAIN_FIRESTAFF", QualityLevel: 2, EnchantmentLevel: 0, AuctionType: "offer"},
		{LocationID: "5003", ItemID: "T5_MAIN_FIRESTAFF", QualityLevel: 2, EnchantmentLevel: 0, AuctionType: "offer"},
		{LocationID: "5003", ItemID: "T5_MAIN_FIRESTAFF", QualityLevel: 1, EnchantmentLevel: 0, AuctionType: "offer"},
	}

	upload := marketUploadWithSnapshot(orders, capturedAt)
	if upload.SnapshotID == "" {
		t.Fatal("snapshot id must be generated")
	}
	if got, want := len(upload.Scope), 2; got != want {
		t.Fatalf("scope count = %d, want %d", got, want)
	}
	if upload.CapturedAt != "2026-08-24T12:30:00.123Z" {
		t.Fatalf("captured_at = %q", upload.CapturedAt)
	}
	if _, err := time.Parse(time.RFC3339Nano, upload.CompletedAt); err != nil {
		t.Fatalf("completed_at is not RFC3339: %v", err)
	}
	if upload.Scope[0].QualityLevel != 1 || upload.Scope[1].QualityLevel != 2 {
		t.Fatalf("scopes are not deterministic by quality: %+v", upload.Scope)
	}
}

func TestMarketUploadSnapshotJSONKeepsLegacyOrders(t *testing.T) {
	upload := marketUploadWithSnapshot(
		[]*lib.MarketOrder{{
			ID: 42, LocationID: "3005", ItemID: "T5_MAIN_FIRESTAFF", QualityLevel: 1,
			EnchantmentLevel: 0, AuctionType: "offer", Price: 100, Amount: 1,
		}},
		time.Date(2026, 8, 24, 12, 30, 0, 0, time.UTC),
	)
	payload, err := json.Marshal(upload)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"SnapshotId", "CapturedAt", "CompletedAt", "Scope", "Orders"} {
		if _, ok := decoded[field]; !ok {
			t.Fatalf("payload missing %s: %s", field, payload)
		}
	}
	orders, ok := decoded["Orders"].([]any)
	if !ok || len(orders) != 1 {
		t.Fatalf("legacy Orders field was not preserved: %s", payload)
	}
}
