package client

import (
	"sync"
	"sync/atomic"
	"testing"

	"github.com/ao-data/albiondata-client/lib"
)

type orderedStateOperation struct {
	sequence  int
	active    *atomic.Int32
	violation *atomic.Bool
	seen      *[]int
}

func TestRouterCorrelacionaHistoricoMesmoComRespostaAntesDaRequisicao(t *testing.T) {
	previousDisableUpload := ConfigGlobal.DisableUpload
	ConfigGlobal.DisableUpload = true
	t.Cleanup(func() { ConfigGlobal.DisableUpload = previousDisableUpload })

	router := newRouter()
	router.albionstate.LocationId = "123"
	go router.run()
	const messageID = 99123
	router.newOperation <- operationAuctionGetItemAverageStatsResponse{
		ItemAmounts: []int64{2}, SilverAmounts: []uint64{100}, Timestamps: []uint64{1}, MessageID: messageID,
	}
	router.newOperation <- operationAuctionGetItemAverageStats{
		ItemID: 42, Quality: 1, Timescale: lib.Hours, MessageID: messageID,
	}
	router.shutdown()

	if len(router.albionstate.pendingMarketHistoryResponses) != 0 {
		t.Fatal("resposta de historico permaneceu pendente depois da requisicao correlata")
	}
	index := messageID % CacheSize
	if got := router.albionstate.marketHistoryIDLookup[index].albionId; got != 0 {
		t.Fatalf("correlacao nao foi consumida; albionId=%d", got)
	}
}

func (op orderedStateOperation) Process(_ *albionState) {
	if op.active.Add(1) != 1 {
		op.violation.Store(true)
	}
	*op.seen = append(*op.seen, op.sequence)
	op.active.Add(-1)
}

func TestRouterSerializaEstadoSobProdutoresConcorrentes(t *testing.T) {
	router := newRouter()
	go router.run()

	var active atomic.Int32
	var violation atomic.Bool
	seen := make([]int, 0, 400)
	var producers sync.WaitGroup
	for producer := 0; producer < 4; producer++ {
		producer := producer
		producers.Add(1)
		go func() {
			defer producers.Done()
			for item := 0; item < 100; item++ {
				router.newOperation <- orderedStateOperation{
					sequence: producer*100 + item, active: &active, violation: &violation, seen: &seen,
				}
			}
		}()
	}
	producers.Wait()
	router.shutdown()

	if violation.Load() {
		t.Fatal("mais de uma operacao alterou albionState simultaneamente")
	}
	if len(seen) != 400 {
		t.Fatalf("router processou %d operacoes, esperado 400", len(seen))
	}
	for producer := 0; producer < 4; producer++ {
		last := -1
		for _, sequence := range seen {
			if sequence/100 != producer {
				continue
			}
			if sequence <= last {
				t.Fatalf("ordem do produtor %d foi quebrada: %d depois de %d", producer, sequence, last)
			}
			last = sequence
		}
	}
}
