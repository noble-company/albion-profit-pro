package lib

import "fmt"

// MarketOrder contains an order (offer or request)
type MarketOrder struct {
	ID               int    `json:"Id"`
	ItemID           string `json:"ItemTypeId"`
	GroupTypeId      string `json:"ItemGroupTypeId"`
	LocationID       string `json:"LocationId"`
	QualityLevel     int    `json:"QualityLevel"`
	EnchantmentLevel int    `json:"EnchantmentLevel"`
	Price            int    `json:"UnitPriceSilver"`
	Amount           int    `json:"Amount"`
	AuctionType      string `json:"AuctionType"`
	Expires          string `json:"Expires"`
}

func (m *MarketOrder) StringArray() []string {
	return []string{
		fmt.Sprintf("%d", m.ID),
		m.ItemID,
		m.LocationID,
		fmt.Sprintf("%d", m.QualityLevel),
		fmt.Sprintf("%d", m.EnchantmentLevel),
		fmt.Sprintf("%d", m.Price),
		fmt.Sprintf("%d", m.Amount),
		m.AuctionType,
		m.Expires,
	}
}

const (
	SalesTax = 0.03
)

type MarketNotificationType string

const (
	SalesNotification  MarketNotificationType = "SalesNotification"
	ExpiryNotification                        = "ExpiryNotification"
)

type MarketNotification interface {
	Type() MarketNotificationType
}

type MarketSellNotification struct {
	MailID          int     `json:"Id"`
	ItemID          string  `json:"ItemTypeId"`
	LocationID      string  `json:"LocationId"`
	Amount          int     `json:"Amount"`
	Expires         string  `json:"Expires"`
	Price           int     `json:"UnitPriceSilver"`
	TotalAfterTaxes float32 `json:"TotalAfterTaxes"`
}

type MarketExpiryNotification struct {
	MailID     int    `json:"Id"`
	ItemID     string `json:"ItemTypeId"`
	LocationID string `json:"LocationId"`
	Amount     int    `json:"Amount"`
	Expires    string `json:"Expires"`
	Price      int    `json:"UnitPriceSilver"`
	Sold       int    `json:"Sold"`
}

func (m *MarketSellNotification) Type() MarketNotificationType {
	return SalesNotification
}

func (m *MarketExpiryNotification) Type() MarketNotificationType {
	return ExpiryNotification
}

type MarketNotificationUpload struct {
	PrivateUpload
	Type         MarketNotificationType `json:"NotificationType"`
	Notification MarketNotification     `json:"Notification"`
}

// MarketSnapshotScope identifies the smallest market book partition that a snapshot covers.
// The backend uses this scope to reconcile only the market/side/quality represented by the
// response, never unrelated orders from the same city.
type MarketSnapshotScope struct {
	MarketID         string `json:"MarketId"`
	ItemID           string `json:"ItemId"`
	QualityLevel     int    `json:"QualityLevel"`
	EnchantmentLevel int    `json:"EnchantmentLevel"`
	AuctionType      string `json:"AuctionType"`
}

// MarketUpload contains a list of orders and, when produced by the local client, the metadata
// needed to transition from the legacy partial-book contract to snapshot reconciliation. The
// legacy Orders field remains unchanged so old ingest endpoints can continue accepting payloads
// during the migration.
type MarketUpload struct {
	SnapshotID  string                `json:"SnapshotId,omitempty"`
	CapturedAt  string                `json:"CapturedAt,omitempty"`
	CompletedAt string                `json:"CompletedAt,omitempty"`
	Scope       []MarketSnapshotScope `json:"Scope,omitempty"`
	Orders      []*MarketOrder        `json:"Orders"`
}
