package client

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/ao-data/albiondata-client/lib"
	"github.com/ao-data/albiondata-client/log"
)

type dispatcher struct {
	mu        sync.Mutex
	uploaders map[string]*queuedUploader
	closed    bool
}

var (
	wsHub *WSHub
	dis   *dispatcher
)

func createDispatcher() {
	dis = &dispatcher{uploaders: make(map[string]*queuedUploader)}

	if ConfigGlobal.EnableWebsockets {
		wsHub = newHub()
		go wsHub.run()
		go runHTTPServer()
	}
}

func (d *dispatcher) uploaderFor(target string) *queuedUploader {
	target = strings.TrimSpace(target)
	if target == "" || target == "noop" {
		return nil
	}

	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return nil
	}
	if existing := d.uploaders[target]; existing != nil {
		return existing
	}

	created := createUploaders([]string{target})
	if len(created) == 0 {
		return nil
	}
	queued := newQueuedUploader(target, created[0], defaultUploadQueueCapacity, defaultUploadWorkerCount)
	d.uploaders[target] = queued
	return queued
}

func (d *dispatcher) shutdown(ctx context.Context) bool {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return true
	}
	d.closed = true
	uploaders := make([]*queuedUploader, 0, len(d.uploaders))
	for _, queued := range d.uploaders {
		uploaders = append(uploaders, queued)
	}
	d.mu.Unlock()

	allDrained := true
	for _, queued := range uploaders {
		if !queued.shutdown(ctx) {
			allDrained = false
		}
	}
	return allDrained
}

func (d *dispatcher) resetUploaders(ctx context.Context) bool {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return false
	}
	uploaders := make([]*queuedUploader, 0, len(d.uploaders))
	for _, queued := range d.uploaders {
		uploaders = append(uploaders, queued)
	}
	d.uploaders = make(map[string]*queuedUploader)
	d.mu.Unlock()

	allDrained := true
	for _, queued := range uploaders {
		if !queued.shutdown(ctx) {
			allDrained = false
		}
	}
	return allDrained
}

func createUploaders(targets []string) []uploader {
	var uploaders []uploader
	for _, target := range targets {
		// PATCH LOCAL (Albion Profit Pro): TrimSpace porque strings.Split(urls, ",") nao
		// apara espaco -- "a, b" produzia o destino " b", que caia no ramo invalido sem
		// explicacao clara.
		target = strings.TrimSpace(target)
		if target == "" {
			continue
		}

		// PATCH LOCAL (Albion Profit Pro): HasPrefix no lugar de target[0:N]. A guarda
		// anterior validava len<4 mas as comparacoes fatiavam [0:8] e [0:9], entao
		// qualquer destino de 4 a 8 caracteres estourava "slice bounds out of range" --
		// inclusive "noop" (anunciado como valido no help do -i) e URLs curtas mas
		// perfeitamente validas como "http://x". HasPrefix e seguro em qualquer tamanho.
		switch {
		case strings.HasPrefix(target, "http+token://"), strings.HasPrefix(target, "https+token://"):
			uploaders = append(uploaders, newHTTPUploaderAuth(target))
		case strings.HasPrefix(target, "http+pow://"), strings.HasPrefix(target, "https+pow://"):
			uploaders = append(uploaders, newHTTPUploaderPow(target))
		case strings.HasPrefix(target, "http://"), strings.HasPrefix(target, "https://"):
			uploaders = append(uploaders, newHTTPUploader(target))
		case strings.HasPrefix(target, "nats://"):
			uploaders = append(uploaders, newNATSUploader(target))
		case target == "noop":
			// anunciado como valido no help do -i; descarta de proposito, sem uploader
		default:
			// Nao ecoar o valor: configuracoes invalidas podem conter credenciais/query.
			log.Info("An invalid ingest target scheme was specified.")
		}
	}

	return uploaders
}

func sendMsgToPublicUploaders(upload interface{}, topic string, state *albionState, identifier string) {
	data, err := json.Marshal(upload)
	if err != nil {
		log.Errorf("Error while marshalling payload for %v: %v", err, topic)
		return
	}

	configuredTargets, _, _ := configuredConnection()
	var PublicIngestBaseUrls = configuredTargets
	// http+pow://albion-online-data.com is used as a magic placeholder for every realm there is
	if strings.Contains(configuredTargets, "https+pow://albion-online-data.com") {
		// we replace the placeholder with the correct one based on the serverID from albionState
		PublicIngestBaseUrls = strings.Replace(PublicIngestBaseUrls, "https+pow://albion-online-data.com", state.AODataIngestBaseURL, -1)
	}

	sendMsgToTargets(data, topic, strings.Split(PublicIngestBaseUrls, ","), state, identifier)
	sendMsgToTargets(data, topic, strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","), state, identifier)

	// If websockets are enabled, send the data there too
	if ConfigGlobal.EnableWebsockets {
		sendMsgToWebSockets(data, topic)
	}
}

func sendMsgToPrivateUploaders(upload lib.PersonalizedUpload, topic string, state *albionState, identifier string) {
	_, _, uploadsDisabled := configuredConnection()
	if uploadsDisabled {
		log.Info("Upload is disabled.")
		return
	}

	// TODO: Re-enable this when issue #14 is fixed
	// Will personalize with blanks for now in order to allow people to see the format
	// if state.CharacterName == "" || state.CharacterId == "" {
	// 	log.Error("The player name or id has not been set. Please restart the game and make sure the client is running.")
	// 	notification.Push("The player name or id has not been set. Please restart the game and make sure the client is running.")
	// 	return
	// }

	upload.Personalize(state.CharacterId, state.CharacterName)

	data, err := json.Marshal(upload)
	if err != nil {
		log.Errorf("Error while marshalling payload for %v: %v", err, topic)
		return
	}

	sendMsgToTargets(data, topic, strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","), state, identifier)

	// If websockets are enabled, send the data there too
	if ConfigGlobal.EnableWebsockets {
		sendMsgToWebSockets(data, topic)
	}
}

// PATCH LOCAL (Albion Profit Pro): resolve e armazena um uploader por destino durante
// todo o ciclo do client. O caminho de captura apenas tenta enfileirar; rede lenta nunca
// cria uma goroutine por pacote nem bloqueia o router.
func sendMsgToTargets(msg []byte, topic string, targets []string, state *albionState, identifier string) {
	_, _, uploadsDisabled := configuredConnection()
	if uploadsDisabled {
		return
	}
	if dis == nil {
		createDispatcher()
	}

	for _, target := range targets {
		target = strings.TrimSpace(target)
		if target == "" || target == "noop" {
			continue
		}
		if isAuthenticatedTarget(target) {
			if !authenticatedUploadsAllowed() {
				continue
			}
			if _, ok := state.serverForAuthenticatedUpload(); !ok {
				continue
			}
		}
		queued := dis.uploaderFor(target)
		if queued != nil {
			queued.enqueue(msg, topic, state, identifier)
		}
	}
}

func isAuthenticatedTarget(target string) bool {
	return strings.HasPrefix(target, "http+token://") || strings.HasPrefix(target, "https+token://")
}

func runHTTPServer() {
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(wsHub, w, r)
	})

	err := http.ListenAndServe(":8099", nil)

	if err != nil {
		log.Panic("ListenAndServe: ", err)
	}
}

func sendMsgToWebSockets(msg []byte, topic string) {
	// TODO (gradius): send JSON data with topic string
	// TODO (gradius): this seems super hacky, and I'm sure there's a better way.
	var result string
	result = "{\"topic\": \"" + topic + "\", \"data\": " + string(msg) + "}"
	wsHub.broadcast <- []byte(result)
}
