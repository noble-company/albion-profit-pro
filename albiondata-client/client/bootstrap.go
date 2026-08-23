package client

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const bootstrapRequestTimeout = 5 * time.Second

var errTransientBootstrap = errors.New("transient bootstrap failure")

type bootstrapController struct {
	ctx        context.Context
	cancel     context.CancelFunc
	client     *http.Client
	targets    []string
	token      string
	authReady  atomic.Bool
	mu         sync.Mutex
	recovering bool
}

var activeBootstrap = struct {
	sync.RWMutex
	controller *bootstrapController
}{}

var uploadBootstrapRunning atomic.Bool

func startUploadBootstrap() func() {
	stopUploadBootstrapKeepingGate()
	uploadBootstrapRunning.Store(true)
	targetConfig, token, disabled := configuredConnection()
	setConnectionStatus(ConnectionConfiguring, "validando destino e credencial")
	if disabled {
		setConnectionStatus(ConnectionUploadDisabled, "habilite um destino para coletar")
		return stopUploadBootstrap
	}

	targets, hasNonAuthenticated, err := authenticatedBootstrapTargets(
		targetConfig,
		strings.EqualFold(buildProfile, "release"),
	)
	if err != nil {
		setConnectionStatus(ConnectionInvalidDestination, "corrija PublicIngestBaseUrls")
		pushNotification("Albion Profit Pro: destino de ingest invalido. Corrija o config.yaml e reinicie o client.")
		return stopUploadBootstrap
	}
	if len(targets) == 0 {
		if hasNonAuthenticated && !strings.EqualFold(buildProfile, "release") {
			setConnectionStatus(ConnectionReady, "destino de desenvolvimento sem autenticacao")
			return stopUploadBootstrap
		}
		setConnectionStatus(ConnectionUploadDisabled, "nenhum destino autenticado configurado")
		return stopUploadBootstrap
	}
	if token == "" {
		setConnectionStatus(ConnectionMissingToken, "configure ApiToken e reinicie")
		pushNotification("Albion Profit Pro: token ausente. Configure ApiToken no config.yaml e reinicie o client.")
		return stopUploadBootstrap
	}

	ctx, cancel := context.WithCancel(context.Background())
	controller := &bootstrapController{
		ctx:     ctx,
		cancel:  cancel,
		client:  &http.Client{Timeout: bootstrapRequestTimeout},
		targets: targets,
		token:   token,
	}
	activeBootstrap.Lock()
	activeBootstrap.controller = controller
	activeBootstrap.Unlock()

	setConnectionStatus(ConnectionAuthenticating, "validando token no backend")
	err = controller.validate()
	switch {
	case err == nil:
		controller.authReady.Store(true)
		setConnectionStatus(ConnectionReady, "backend autenticado")
	case errors.Is(err, errTransientBootstrap):
		setConnectionStatus(ConnectionBackendUnavailable, "recuperacao automatica ativa")
		controller.startRecovery()
	default:
		setConnectionStatus(ConnectionUnauthorized, "token invalido ou revogado")
		pushNotification("Albion Profit Pro: token invalido ou revogado. Gere outro token, atualize o config.yaml e reinicie.")
	}

	return stopUploadBootstrap
}

func stopUploadBootstrap() {
	stopUploadBootstrapController(false)
}

func stopUploadBootstrapKeepingGate() {
	stopUploadBootstrapController(true)
}

func stopUploadBootstrapController(keepBlocked bool) {
	activeBootstrap.Lock()
	controller := activeBootstrap.controller
	activeBootstrap.controller = nil
	activeBootstrap.Unlock()
	if controller != nil {
		controller.cancel()
	}
	uploadBootstrapRunning.Store(keepBlocked)
}

// RevalidateConnectionConfiguration recarrega config.yaml e refaz o handshake. E chamada
// pelo systray depois que o usuario corrige URL/token, sem exigir reinicio do processo.
func RevalidateConnectionConfiguration() {
	pauseAuthenticatedUploads()
	if dis != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		dis.resetUploaders(ctx)
		cancel()
	}
	stopUploadBootstrapKeepingGate()
	setConnectionStatus(ConnectionConfiguring, "recarregando config.yaml")
	if err := reloadConnectionConfigFromFile(); err != nil {
		setConnectionStatus(ConnectionInvalidDestination, "config.yaml nao pode ser recarregado")
		pushNotification("Albion Profit Pro: nao foi possivel recarregar config.yaml.")
		return
	}
	startUploadBootstrap()
}

func pauseAuthenticatedUploads() {
	activeBootstrap.RLock()
	controller := activeBootstrap.controller
	activeBootstrap.RUnlock()
	if controller != nil {
		controller.authReady.Store(false)
	}
}

func authenticatedBootstrapTargets(targets string, release bool) ([]string, bool, error) {
	var authenticated []string
	hasNonAuthenticated := false
	for _, rawTarget := range strings.Split(targets, ",") {
		target := strings.TrimSpace(rawTarget)
		if target == "" || target == "noop" {
			continue
		}
		baseURL, authenticatedTarget, err := normalizeProfitProDestination(target)
		if err != nil {
			return nil, hasNonAuthenticated, err
		}
		if !authenticatedTarget {
			hasNonAuthenticated = true
			if release {
				return nil, true, fmt.Errorf("release requires authenticated destination")
			}
			continue
		}
		authenticated = append(authenticated, baseURL)
	}
	return authenticated, hasNonAuthenticated, nil
}

func normalizeProfitProDestination(target string) (string, bool, error) {
	parsed, err := url.Parse(target)
	if err != nil || parsed.Host == "" {
		return "", false, fmt.Errorf("invalid destination")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", false, fmt.Errorf("destination cannot contain userinfo, query or fragment")
	}
	switch parsed.Scheme {
	case "http+token":
		parsed.Scheme = "http"
		return strings.TrimRight(parsed.String(), "/"), true, nil
	case "https+token":
		parsed.Scheme = "https"
		return strings.TrimRight(parsed.String(), "/"), true, nil
	case "http", "https", "http+pow", "https+pow", "nats":
		return "", false, nil
	default:
		return "", false, fmt.Errorf("unsupported destination scheme")
	}
}

func (controller *bootstrapController) validate() error {
	for _, baseURL := range controller.targets {
		endpoint, err := url.JoinPath(baseURL, "client/me")
		if err != nil {
			return fmt.Errorf("invalid client identity endpoint")
		}
		req, err := http.NewRequestWithContext(controller.ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return fmt.Errorf("invalid client identity request")
		}
		req.Header.Set("Authorization", "Bearer "+controller.token)
		req.Header.Set("User-Agent", fmt.Sprintf("albiondata-client/%s", version))
		resp, err := controller.client.Do(req)
		if err != nil {
			return errTransientBootstrap
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		_ = resp.Body.Close()
		if readErr != nil {
			return errTransientBootstrap
		}
		switch {
		case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
			return fmt.Errorf("unauthorized")
		case resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
			return errTransientBootstrap
		case resp.StatusCode < 200 || resp.StatusCode > 299:
			return fmt.Errorf("identity endpoint rejected request")
		}
		var identity struct {
			TokenSuffix string `json:"token_sufixo"`
		}
		if json.Unmarshal(body, &identity) != nil || identity.TokenSuffix == "" {
			return fmt.Errorf("invalid identity response")
		}
	}
	return nil
}

func (controller *bootstrapController) startRecovery() {
	controller.mu.Lock()
	if controller.recovering {
		controller.mu.Unlock()
		return
	}
	controller.recovering = true
	controller.mu.Unlock()

	go func() {
		defer func() {
			controller.mu.Lock()
			controller.recovering = false
			controller.mu.Unlock()
		}()
		delays := []time.Duration{time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second, 30 * time.Second}
		attempt := 0
		for {
			delay := delays[attempt]
			if attempt < len(delays)-1 {
				attempt++
			}
			timer := time.NewTimer(delay)
			select {
			case <-controller.ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			setConnectionStatus(ConnectionAuthenticating, "tentando reconectar ao backend")
			err := controller.validate()
			if err == nil {
				controller.authReady.Store(true)
				setConnectionStatus(ConnectionReady, "backend autenticado")
				return
			}
			if !errors.Is(err, errTransientBootstrap) {
				controller.authReady.Store(false)
				setConnectionStatus(ConnectionUnauthorized, "token invalido ou revogado")
				return
			}
			setConnectionStatus(ConnectionBackendUnavailable, "recuperacao automatica ativa")
		}
	}()
}

func authenticatedUploadsAllowed() bool {
	if !uploadBootstrapRunning.Load() {
		return true
	}
	activeBootstrap.RLock()
	controller := activeBootstrap.controller
	activeBootstrap.RUnlock()
	return controller != nil && controller.authReady.Load()
}

func markUploadUnauthorized() {
	activeBootstrap.RLock()
	controller := activeBootstrap.controller
	activeBootstrap.RUnlock()
	if controller == nil {
		return
	}
	controller.authReady.Store(false)
	setConnectionStatus(ConnectionUnauthorized, "token invalido ou revogado")
}

func markUploadBackendUnavailable() {
	activeBootstrap.RLock()
	controller := activeBootstrap.controller
	activeBootstrap.RUnlock()
	if controller == nil {
		return
	}
	controller.authReady.Store(false)
	setConnectionStatus(ConnectionBackendUnavailable, "recuperacao automatica ativa")
	controller.startRecovery()
}

func markRealmUnknown() {
	activeBootstrap.RLock()
	controller := activeBootstrap.controller
	activeBootstrap.RUnlock()
	if controller != nil && controller.authReady.Load() {
		setConnectionStatus(ConnectionUnknownRealm, "atravesse uma passagem de zona")
	}
}

func markRealmReady(realm AlbionServer) {
	activeBootstrap.RLock()
	controller := activeBootstrap.controller
	activeBootstrap.RUnlock()
	if controller != nil && controller.authReady.Load() {
		setConnectionStatus(ConnectionReady, "backend autenticado | realm="+string(realm))
	}
}
