package client

import "github.com/ao-data/albiondata-client/log"

// eventUpdateMoney carries the player's absolute silver balance.
type eventUpdateMoney struct {
	EntityID int64 `mapstructure:"0"`
	Silver   int64 `mapstructure:"1"`
	Gold     int64 `mapstructure:"2"`
}

func (event eventUpdateMoney) Process(state *albionState) {
	if state.hasSilverBalance && state.pendingMarketSale != nil {
		delta := event.Silver - state.silverBalance
		pending := state.pendingMarketSale
		log.Warnf("Market transaction value: name=%s order=%d item=%d quantity=%d silver_delta_raw=%d silver_delta=%.3f balance_before=%d balance_after=%d", pending.name, pending.orderID, pending.itemID, pending.quantity, delta, float64(delta)/1000.0, state.silverBalance, event.Silver)
		state.pendingMarketSale = nil
	}
	state.silverBalance = event.Silver
	state.hasSilverBalance = true
}
