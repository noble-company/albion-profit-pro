package client

import (
	"encoding/json"
	"net/http"

	"strings"

	"github.com/ao-data/albiondata-client/lib"
	"github.com/ao-data/albiondata-client/log"
)

type dispatcher struct{}

var (
	wsHub *WSHub
	dis   *dispatcher
)

func createDispatcher() {
	dis = &dispatcher{}

	if ConfigGlobal.EnableWebsockets {
		wsHub = newHub()
		go wsHub.run()
		go runHTTPServer()
	}
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
			log.Infof("An invalid ingest target was specified: %v", target)
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

	var PublicIngestBaseUrls = ConfigGlobal.PublicIngestBaseUrls
	// http+pow://albion-online-data.com is used as a magic placeholder for every realm there is
	if strings.Contains(ConfigGlobal.PublicIngestBaseUrls, "https+pow://albion-online-data.com") {
		// we replace the placeholder with the correct one based on the serverID from albionState
		PublicIngestBaseUrls = strings.Replace(PublicIngestBaseUrls, "https+pow://albion-online-data.com", state.AODataIngestBaseURL, -1)
	}

	var publicUploaders = createUploaders(strings.Split(PublicIngestBaseUrls, ","))
	var privateUploaders = createUploaders(strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","))

	sendMsgToUploaders(data, topic, publicUploaders, state, identifier)
	sendMsgToUploaders(data, topic, privateUploaders, state, identifier)

	// If websockets are enabled, send the data there too
	if ConfigGlobal.EnableWebsockets {
		sendMsgToWebSockets(data, topic)
	}
}

func sendMsgToPrivateUploaders(upload lib.PersonalizedUpload, topic string, state *albionState, identifier string) {
	if ConfigGlobal.DisableUpload {
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

	var privateUploaders = createUploaders(strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","))
	if len(privateUploaders) > 0 {
		sendMsgToUploaders(data, topic, privateUploaders, state, identifier)
	}

	// If websockets are enabled, send the data there too
	if ConfigGlobal.EnableWebsockets {
		sendMsgToWebSockets(data, topic)
	}
}

func sendMsgToUploaders(msg []byte, topic string, uploaders []uploader, state *albionState, identifier string) {
	if ConfigGlobal.DisableUpload {
		log.Info("Upload is disabled.")
		return
	}

	for _, u := range uploaders {
		u.sendToIngest(msg, topic, state, identifier)
	}
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
