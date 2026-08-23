package client

import (
	"sync"
	"time"

	"github.com/ao-data/albiondata-client/log"
	nats "github.com/nats-io/go-nats"
)

type natsUploader struct {
	isPrivate bool
	url       string
	nc        *nats.Conn
	mu        sync.Mutex
}

// newNATSUploader creates a new NATS uploader
func newNATSUploader(url string) uploader {
	return &natsUploader{
		url: url,
	}
}

func (u *natsUploader) sendToIngest(body []byte, topic string, metadata uploadMetadata, identifier string) {
	// not handling sending identifier since the official usage is with http_pow

	u.mu.Lock()
	if u.nc == nil {
		// PATCH LOCAL (Albion Profit Pro): a conexao e aberta pelo worker da fila, nunca
		// pela goroutine de captura que apenas cria/registra o destino.
		nc, err := nats.Connect(u.url, nats.Timeout(2*time.Second))
		if err != nil {
			u.mu.Unlock()
			log.Errorf("Could not connect NATS uploader (destination=%s topic=%s result=failed error_type=%T)", sanitizeDestination(u.url), topic, err)
			return
		}
		u.nc = nc
	}
	nc := u.nc
	u.mu.Unlock()
	if nc == nil {
		log.Errorf("NATS uploader is not connected (destination=%s topic=%s result=failed)", sanitizeDestination(u.url), topic)
		return
	}
	if err := nc.Publish(topic, body); err != nil {
		log.Errorf("NATS publish failed (destination=%s topic=%s result=failed error_type=%T)", sanitizeDestination(u.url), topic, err)
	}
}

func (u *natsUploader) close() {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.nc != nil {
		u.nc.Close()
		u.nc = nil
	}
}
