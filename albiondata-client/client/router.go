package client

import (
	"encoding/gob"
	"os"
	"sync"

	"github.com/ao-data/albiondata-client/client/photon"
	"github.com/ao-data/albiondata-client/log"
)

// Router struct definitions
type Router struct {
	albionstate     *albionState
	newOperation    chan operation
	recordRawPacket chan photon.RawPacket
	quit            chan struct{}
	done            chan struct{}
	quitOnce        sync.Once
}

func newRouter() *Router {
	return &Router{
		albionstate:     &albionState{LocationId: ""},
		newOperation:    make(chan operation, 1000),
		recordRawPacket: make(chan photon.RawPacket, 1000),
		quit:            make(chan struct{}),
		done:            make(chan struct{}),
	}
}

func (r *Router) run() {
	defer close(r.done)
	var encoder *gob.Encoder
	var file *os.File
	if ConfigGlobal.RecordPath != "" {
		file, err := os.Create(ConfigGlobal.RecordPath)
		if err != nil {
			log.Error("Could not open commands output file ", err)
		} else {
			encoder = gob.NewEncoder(file)
		}
	}

	for {
		select {
		case <-r.quit:
			log.Debug("Closing router...")
			r.drain(encoder)
			closeRouterFile(file)
			return
		case op := <-r.newOperation:
			// PATCH LOCAL (Albion Profit Pro): todas as mutacoes do albionState passam
			// por esta unica goroutine. Upload e assincrono no dispatcher, portanto o
			// router nao fica preso em rede e nao precisa criar goroutines ilimitadas.
			op.Process(r.albionstate)
		case raw := <-r.recordRawPacket:
			if encoder != nil {
				err := encoder.Encode(raw)
				if err != nil {
					log.Error("Could not encode raw packet ", err)
				}
			}
		}
	}
}

func (r *Router) drain(encoder *gob.Encoder) {
	for {
		select {
		case op := <-r.newOperation:
			op.Process(r.albionstate)
		case raw := <-r.recordRawPacket:
			if encoder != nil {
				if err := encoder.Encode(raw); err != nil {
					log.Error("Could not encode raw packet ", err)
				}
			}
		default:
			return
		}
	}
}

func closeRouterFile(file *os.File) {
	if file != nil {
		if err := file.Close(); err != nil {
			log.Error("Could not close commands output file ", err)
		}
	}
}

func (r *Router) shutdown() {
	r.quitOnce.Do(func() { close(r.quit) })
	<-r.done
}

func (r *Router) enqueueOperation(op operation) bool {
	select {
	case r.newOperation <- op:
		return true
	case <-r.quit:
		return false
	}
}

func (r *Router) enqueueRawPacket(raw photon.RawPacket) bool {
	select {
	case r.recordRawPacket <- raw:
		return true
	case <-r.quit:
		return false
	}
}

// serverPacketOperation e encryptedMarketOperation colocam as duas mutacoes que antes
// aconteciam diretamente nas goroutines dos listeners na mesma ordem das operacoes Photon.
type serverPacketOperation struct {
	ip string
}

func (op serverPacketOperation) Process(state *albionState) {
	state.GameServerIP = op.ip
	state.AODataServerID, state.AODataIngestBaseURL = state.GetServer()
	if server, ok := albionServerFromID(state.AODataServerID); ok {
		markRealmReady(server)
	}
	log.Tracef("Server ID: %d", state.AODataServerID)
	log.Tracef("Using AODataIngestBaseURL: %s", state.AODataIngestBaseURL)
}

type encryptedMarketOperation struct{}

func (encryptedMarketOperation) Process(state *albionState) {
	if state.WaitingForMarketData {
		state.WaitingForMarketData = false
		log.Info("Market data is encrypted. Please see https://www.albion-online-data.com/client/encryption.html for more information.")
	}
}
