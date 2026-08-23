package client

import (
	"regexp"
	"strings"
	"time"

	"github.com/ao-data/albiondata-client/lib"
	"github.com/ao-data/albiondata-client/log"
	"github.com/ao-data/albiondata-client/notification"
)

// CacheSize limit size of messages in cache
const CacheSize = 8192

type marketHistoryInfo struct {
	albionId  int32
	timescale lib.Timescale
	quality   uint8
	messageID uint64
}

type albionState struct {
	LocationId                   string
	LocationString               string
	CharacterId                  lib.CharacterID
	CharacterName                string
	GameServerIP                 string
	AODataServerID               int
	AODataIngestBaseURL          string
	WaitingForMarketData         bool
	BanditEventLastTimeSubmitted time.Time
	FestivitiesLastTimeSubmitted time.Time
	// PATCH LOCAL (Albion Profit Pro): debounce do aviso de localizacao. IsValidLocation()
	// e chamada no Process de toda resposta de mercado, e router.go dispara uma goroutine
	// por operacao -- sem isso era uma notificacao nativa do SO por pacote rejeitado.
	// Mesmo padrao dos dois campos acima.
	LocationWarningLastSentAt time.Time
	// PATCH LOCAL (Albion Profit Pro): authenticated uploads are held until the
	// packet source identifies west/east/europe. Debounce avoids one toast per packet.
	ServerWarningLastSentAt time.Time

	// A lot of information is sent out but not contained in the response when requesting marketHistory (e.g. ID)
	// This information is stored in marketHistoryInfo
	// This array acts as a type of cache for that info
	// The index is the message number (param255) % CacheSize
	marketHistoryIDLookup [CacheSize]marketHistoryInfo
	// PATCH LOCAL (Albion Profit Pro): respostas podem chegar antes da requisicao quando
	// varias interfaces capturam o mesmo fluxo. O router serializado guarda a resposta em
	// vez de dormir e bloquear todas as operacoes por ate 30 segundos.
	pendingMarketHistoryResponses map[uint64]operationAuctionGetItemAverageStatsResponse
	// TODO could this be improved?!
}

// PATCH LOCAL (Albion Profit Pro): ponto de injecao para teste. notification.Push e chamada
// direta e nao da para observar de um teste; com a variavel, o teste substitui e conta.
var pushNotification = notification.Push

// locationWarningInterval e a janela de debounce do aviso de localizacao. 60s, mesmo valor
// que eventFestivitiesUpdate ja usa para o proprio throttle.
const locationWarningInterval = 60 * time.Second

// PATCH LOCAL (Albion Profit Pro): same user-facing debounce policy as location.
const serverWarningInterval = 60 * time.Second

// PATCH LOCAL (Albion Profit Pro): receiver por PONTEIRO (era por valor). Alem de copiar o
// struct inteiro -- incluindo marketHistoryIDLookup, um array de 8192 posicoes -- a cada
// chamada num caminho quente, o receiver por valor tornava impossivel memoizar "ja avisei":
// qualquer campo escrito morria com a copia.
func (state *albionState) IsValidLocation() bool {
	var onlydigits = regexp.MustCompile(`^[0-9]+$`)

	switch {
	case state.LocationId == "":
		state.avisarLocalizacao("Albion Profit Pro nao esta coletando: atravesse uma passagem de zona para ativar a coleta de dados de mercado.")
		return false

	case onlydigits.MatchString(state.LocationId):
		return true
	case strings.HasPrefix(state.LocationId, "BLACKBANK-"):
		return true
	case strings.HasSuffix(state.LocationId, "-HellDen"):
		return true
	case strings.HasSuffix(state.LocationId, "-Auction2"):
		return true
	default:
		state.avisarLocalizacao("Albion Profit Pro nao esta coletando: a localizacao atual (" + state.LocationId + ") nao e um mercado reconhecido. Va ate uma cidade e atravesse uma passagem de zona.")
		return false
	}
}

// avisarLocalizacao loga sempre e notifica no maximo uma vez por locationWarningInterval.
//
// PATCH LOCAL (Albion Profit Pro): antes nao havia debounce nenhum e a notificacao era
// suprimida justamente sob -debug (`if !ConfigGlobal.Debug`) -- ou seja, quem estava
// depurando, a pessoa com maior chance de agir sobre o aviso, era quem nao o via. A
// supressao existia provavelmente para conter a tempestade de toasts; com o debounce no
// lugar, ela deixa de ser necessaria.
//
// O log continua a cada ocorrencia de proposito: vai para arquivo, nao interrompe ninguem, e
// a contagem ajuda a dimensionar por quanto tempo o client ficou descartando dado.
func (state *albionState) avisarLocalizacao(msg string) {
	log.Error(msg)

	if !state.LocationWarningLastSentAt.IsZero() &&
		time.Since(state.LocationWarningLastSentAt) < locationWarningInterval {
		return
	}
	state.LocationWarningLastSentAt = time.Now()
	pushNotification(msg)
}

// serverForAuthenticatedUpload returns no default on purpose. Market economies
// are isolated by realm, so sending an unidentified payload would corrupt data.
func (state *albionState) serverForAuthenticatedUpload() (AlbionServer, bool) {
	server, ok := albionServerFromID(state.AODataServerID)
	if ok {
		markRealmReady(server)
		return server, true
	}
	markRealmUnknown()

	msg := "Albion Profit Pro ainda nao identificou o servidor (West/East/Europe); o upload de mercado foi pausado. Atravesse uma passagem de zona com o client aberto."
	log.Error(msg)
	if state.ServerWarningLastSentAt.IsZero() ||
		time.Since(state.ServerWarningLastSentAt) >= serverWarningInterval {
		state.ServerWarningLastSentAt = time.Now()
		pushNotification(msg)
	}
	return "", false
}

func (state albionState) GetServer() (int, string) {
	// default to 0
	var serverID = 0
	var AODataIngestBaseURL = ""

	// if we happen to have a server id stored in state, lets re-default to that
	if state.AODataServerID != 0 {
		serverID = state.AODataServerID
	}
	if state.AODataIngestBaseURL != "" {
		AODataIngestBaseURL = state.AODataIngestBaseURL
	}

	// we get packets from other than game servers, so determine if it's a game server
	// based on soruce ip and if its east/west servers
	var isAlbionIP = false
	if strings.HasPrefix(state.GameServerIP, "5.188.125.") {
		// west server class c ip range
		serverID = 1
		isAlbionIP = true
		AODataIngestBaseURL = "https+pow://pow.west.albion-online-data.com"
	} else if strings.HasPrefix(state.GameServerIP, "5.45.187.") {
		// east server class c ip range
		isAlbionIP = true
		serverID = 2
		AODataIngestBaseURL = "https+pow://pow.east.albion-online-data.com"
	} else if strings.HasPrefix(state.GameServerIP, "193.169.238.") {
		// eu server class c ip range
		isAlbionIP = true
		serverID = 3
		AODataIngestBaseURL = "https+pow://pow.europe.albion-online-data.com"
	}

	// if this was a known albion online server ip, then let's log it
	if isAlbionIP {
		log.Tracef("Returning Server ID %v (ip src: %v)", serverID, state.GameServerIP)
		log.Tracef("Returning AODataIngestBaseURL %v (ip src: %v)", AODataIngestBaseURL, state.GameServerIP)
	}

	return serverID, AODataIngestBaseURL
}
