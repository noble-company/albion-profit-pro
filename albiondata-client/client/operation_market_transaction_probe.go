package client

import (
	"fmt"
	"strconv"

	"github.com/ao-data/albiondata-client/log"
)

// rawMarketTransactionOperation is intentionally only a probe for the first
// investigation pass. The wire shape of direct/quick sells is not stable in
// the community protocol, so we retain the complete decoded parameter map
// before defining a public ingest contract.
type rawMarketTransactionOperation struct {
	name   string
	params map[uint8]interface{}
}

type marketTransactionObservation struct {
	name      string
	orderID   int64
	itemID    int64
	quantity  int64
	requestedAt string
}

func (op *rawMarketTransactionOperation) setRawParams(params map[uint8]interface{}) {
	op.params = params
}

func (op rawMarketTransactionOperation) Process(state *albionState) {
	observation := &marketTransactionObservation{name: op.name}
	var orderOK, itemOK, quantityOK bool
	if op.params != nil {
		observation.orderID, orderOK = marketTransactionInt64(op.params[1])
		observation.itemID, itemOK = marketTransactionInt64(op.params[2])
		observation.quantity, quantityOK = marketTransactionInt64(op.params[4])
	}
	if !orderOK || !itemOK || !quantityOK {
		return
	}
	state.pendingMarketSale = observation
	log.Warnf("Market transaction (%s): order=%d item=%d quantity=%d params=%s", op.name, observation.orderID, observation.itemID, observation.quantity, formatMarketTransactionParams(op.params))
}

func marketTransactionInt64(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case int:
		return int64(v), true
	case int8:
		return int64(v), true
	case int16:
		return int64(v), true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case uint8:
		return int64(v), true
	case uint16:
		return int64(v), true
	case uint32:
		return int64(v), true
	case uint64:
		return int64(v), true
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func formatMarketTransactionParams(params map[uint8]interface{}) string {
	if len(params) == 0 {
		return "<sem parametros>"
	}
	return fmt.Sprintf("%v", params)
}
