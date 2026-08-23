package client

import (
	"context"
	"sync"
	"time"

	"github.com/ao-data/albiondata-client/log"
)

var version string

// Client struct base
type Client struct {
	stop     chan struct{}
	done     chan struct{}
	stopOnce sync.Once
}

var activeClient struct {
	sync.Mutex
	client *Client
}

// NewClient return a new Client instance
func NewClient(_version string) *Client {
	version = _version
	return &Client{stop: make(chan struct{}), done: make(chan struct{})}
}

// Run starts client settings and run
func (client *Client) Run() error {
	stopBootstrap := func() {}
	activeClient.Lock()
	activeClient.client = client
	activeClient.Unlock()
	defer func() {
		// PATCH LOCAL (Albion Profit Pro): a captura ja parou quando chegamos aqui.
		// Drenamos uploads por um prazo finito e sempre fechamos transports/conexoes.
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if dis != nil {
			dis.shutdown(ctx)
		}
		stopBootstrap()

		activeClient.Lock()
		if activeClient.client == client {
			activeClient.client = nil
		}
		activeClient.Unlock()
		close(client.done)
	}()

	log.Infof("Starting Albion Data Client, version: %s", version)
	log.Info("This is a third-party application and is in no way affiliated with Sandbox Interactive or Albion Online.")
	log.Info("Additional parameters can listed by calling this file with the -h parameter.")

	stopBootstrap = startUploadBootstrap()
	if currentConnectionState() == ConnectionReady {
		markRealmUnknown()
	}

	ConfigGlobal.setupDebugEvents()
	ConfigGlobal.setupDebugOperations()

	createDispatcher()

	if ConfigGlobal.Offline {
		processOffline(ConfigGlobal.OfflinePath)
	} else {
		apw := newAlbionProcessWatcher()
		return apw.run(client.stop)
	}
	return nil
}

// RequestShutdown e usado pela systray e pelo updater. Ele pede que a captura pare e
// aguarda o ciclo normal de limpeza; nao chama os.Exit e nao deixa uploads em voo orfaos.
func RequestShutdown(timeout time.Duration) bool {
	activeClient.Lock()
	client := activeClient.client
	activeClient.Unlock()
	if client == nil {
		return true
	}

	client.stopOnce.Do(func() { close(client.stop) })
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-client.done:
		return true
	case <-timer.C:
		log.Warnf("Client shutdown deadline reached after %s", timeout)
		return false
	}
}
