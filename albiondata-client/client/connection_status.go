package client

import (
	"sync"

	"github.com/ao-data/albiondata-client/log"
)

// PATCH LOCAL (Albion Profit Pro): estado pequeno e observavel do bootstrap de upload.
// Nunca inclui URL completa, header ou token.
type ConnectionState string

const (
	ConnectionConfiguring        ConnectionState = "configurando"
	ConnectionAuthenticating     ConnectionState = "autenticando"
	ConnectionReady              ConnectionState = "pronto"
	ConnectionUploadDisabled     ConnectionState = "upload desabilitado"
	ConnectionMissingToken       ConnectionState = "token ausente"
	ConnectionUnauthorized       ConnectionState = "token invalido ou revogado"
	ConnectionUnknownRealm       ConnectionState = "realm desconhecido"
	ConnectionBackendUnavailable ConnectionState = "backend indisponivel"
	ConnectionInvalidDestination ConnectionState = "destino invalido"
)

var connectionStatus = struct {
	sync.RWMutex
	state   ConnectionState
	detail  string
	changes chan string
}{
	state:   ConnectionConfiguring,
	detail:  "validando configuracao",
	changes: make(chan string, 1),
}

func setConnectionStatus(state ConnectionState, detail string) {
	connectionStatus.Lock()
	changed := connectionStatus.state != state || connectionStatus.detail != detail
	connectionStatus.state = state
	connectionStatus.detail = detail
	label := connectionStatusLabelLocked()
	connectionStatus.Unlock()

	if !changed {
		return
	}
	log.Infof("Albion Profit Pro connection state: state=%s detail=%s", state, detail)
	select {
	case connectionStatus.changes <- label:
	default:
		select {
		case <-connectionStatus.changes:
		default:
		}
		select {
		case connectionStatus.changes <- label:
		default:
		}
	}
}

func connectionStatusLabelLocked() string {
	if connectionStatus.detail == "" {
		return string(connectionStatus.state)
	}
	return string(connectionStatus.state) + " | " + connectionStatus.detail
}

// ConnectionStatusLabel e consumido pelo systray sem acoplar a UI ao bootstrap HTTP.
func ConnectionStatusLabel() string {
	connectionStatus.RLock()
	defer connectionStatus.RUnlock()
	return connectionStatusLabelLocked()
}

func ConnectionStatusChanges() <-chan string {
	return connectionStatus.changes
}

func currentConnectionState() ConnectionState {
	connectionStatus.RLock()
	defer connectionStatus.RUnlock()
	return connectionStatus.state
}
