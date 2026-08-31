package client

import (
	"sort"
	"time"

	"github.com/ao-data/albiondata-client/lib"
	uuid "github.com/nu7hatch/gouuid"
)

// marketUploadWithSnapshot annotates the existing MarketUpload payload without changing the
// wire shape of any individual order. A response is considered complete for the scopes actually
// present in that response; later tasks add request correlation so an empty scope can be emitted
// when the game returns no orders.
func marketUploadWithSnapshot(orders []*lib.MarketOrder, capturedAt time.Time) lib.MarketUpload {
	scopes := make(map[lib.MarketSnapshotScope]struct{})
	for _, order := range orders {
		if order == nil {
			continue
		}
		scope := lib.MarketSnapshotScope{
			MarketID:         order.LocationID,
			ItemID:           order.ItemID,
			QualityLevel:     order.QualityLevel,
			EnchantmentLevel: order.EnchantmentLevel,
			AuctionType:      order.AuctionType,
		}
		scopes[scope] = struct{}{}
	}

	snapshotScopes := make([]lib.MarketSnapshotScope, 0, len(scopes))
	for scope := range scopes {
		snapshotScopes = append(snapshotScopes, scope)
	}
	sort.Slice(snapshotScopes, func(i, j int) bool {
		left, right := snapshotScopes[i], snapshotScopes[j]
		if left.MarketID != right.MarketID {
			return left.MarketID < right.MarketID
		}
		if left.ItemID != right.ItemID {
			return left.ItemID < right.ItemID
		}
		if left.QualityLevel != right.QualityLevel {
			return left.QualityLevel < right.QualityLevel
		}
		if left.EnchantmentLevel != right.EnchantmentLevel {
			return left.EnchantmentLevel < right.EnchantmentLevel
		}
		return left.AuctionType < right.AuctionType
	})

	snapshotID, _ := uuid.NewV4()
	completedAt := time.Now().UTC()
	return lib.MarketUpload{
		SnapshotID:  snapshotID.String(),
		CapturedAt: capturedAt.UTC().Format(time.RFC3339Nano),
		CompletedAt: completedAt.Format(time.RFC3339Nano),
		Scope:       snapshotScopes,
		Orders:      orders,
	}
}
