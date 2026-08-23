package client

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ao-data/albiondata-client/log"
)

// PATCH LOCAL (Albion Profit Pro): teto por requisicao. Sem isso o http.Client nao tem
// timeout nenhum e o http.Transport tambem e pelado. O uploader agora e reutilizado e a fila
// e limitada, mas cada tentativa ainda precisa de teto para permitir shutdown previsivel.
const ingestRequestTimeout = 30 * time.Second

const (
	defaultIngestMaxAttempts = 4
	defaultRetryBaseDelay    = 250 * time.Millisecond
	defaultRetryMaxDelay     = 5 * time.Second
)

type httpRetryPolicy struct {
	maxAttempts int
	baseDelay   time.Duration
	maxDelay    time.Duration
}

type httpUploader struct {
	baseURL       string
	transport     *http.Transport
	client        *http.Client
	ctx           context.Context
	cancel        context.CancelFunc
	retry         httpRetryPolicy
	authenticated bool
	// PATCH LOCAL (Albion Profit Pro): vazio = nao envia Authorization. So destinos
	// marcados com o esquema "+token" preenchem isso -- ver newHTTPUploaderAuth.
	apiToken string
}

// newHTTPUploader creates a new HTTP uploader
func newHTTPUploader(url string) uploader {
	return buildHTTPUploader(url, false, "")
}

// newHTTPUploaderAuth cria um uploader autenticado para o ingest do Albion Profit Pro.
//
// PATCH LOCAL (Albion Profit Pro): o marcador "+token" e removido da URL antes de qualquer
// requisicao sair -- mesmo padrao do "+pow" (uploader_http_pow.go). O esquema existe para
// que o token seja anexado SO aos nossos destinos: o -i aceita lista separada por virgula,
// e sem essa marcacao adicionar um segundo destino depois mandaria o nosso token de ingest
// junto para um terceiro.
func newHTTPUploaderAuth(url string) uploader {
	url = stripTokenScheme(url)
	_, token, _ := configuredConnection()
	return buildHTTPUploader(url, true, token)
}

func stripTokenScheme(rawURL string) string {
	switch {
	case strings.HasPrefix(rawURL, "https+token://"):
		return "https://" + strings.TrimPrefix(rawURL, "https+token://")
	case strings.HasPrefix(rawURL, "http+token://"):
		return "http://" + strings.TrimPrefix(rawURL, "http+token://")
	default:
		return rawURL
	}
}

func buildHTTPUploader(baseURL string, authenticated bool, apiToken string) *httpUploader {
	transport := &http.Transport{}
	ctx, cancel := context.WithCancel(context.Background())
	return &httpUploader{
		baseURL:   baseURL,
		transport: transport,
		client:    &http.Client{Transport: transport, Timeout: ingestRequestTimeout},
		ctx:       ctx,
		cancel:    cancel,
		retry: httpRetryPolicy{
			maxAttempts: defaultIngestMaxAttempts,
			baseDelay:   defaultRetryBaseDelay,
			maxDelay:    defaultRetryMaxDelay,
		},
		authenticated: authenticated,
		apiToken:      apiToken,
	}
}

func (u *httpUploader) sendToIngest(body []byte, topic string, metadata uploadMetadata, identifier string) {
	if u.authenticated && !authenticatedUploadsAllowed() {
		return
	}
	// not handling sending identifier since the official usage is with http_pow
	realm := "unknown"
	// PATCH LOCAL (Albion Profit Pro): realm is product metadata and only leaves
	// through authenticated +token destinations. Unknown realm holds the upload.
	if u.authenticated {
		server, ok := albionServerFromID(metadata.serverID)
		if !ok {
			return
		}
		realm = string(server)
	}

	for attempt := 1; attempt <= u.retry.maxAttempts; attempt++ {
		status, retryAfter, err := u.doRequest(body, topic, realm)
		if err == nil && status >= 200 && status <= 299 {
			log.Infof(
				"Ingest request completed (attempt=%d destination=%s topic=%s realm=%s result=success status=%d)",
				attempt, sanitizeDestination(u.baseURL), topic, realm, status,
			)
			return
		}

		retryable := err != nil || isRetryableHTTPStatus(status)
		if !retryable || attempt == u.retry.maxAttempts {
			if u.authenticated && status == http.StatusUnauthorized {
				markUploadUnauthorized()
			}
			if u.authenticated && (err != nil || isRetryableHTTPStatus(status)) {
				markUploadBackendUnavailable()
			}
			if err != nil {
				log.Errorf(
					"Ingest request failed (attempt=%d destination=%s topic=%s realm=%s result=failed error_type=%T)",
					attempt, sanitizeDestination(u.baseURL), topic, realm, err,
				)
			} else {
				log.Errorf(
					"Ingest request rejected (attempt=%d destination=%s topic=%s realm=%s result=failed status=%d)",
					attempt, sanitizeDestination(u.baseURL), topic, realm, status,
				)
			}
			return
		}

		delay := u.retryDelay(attempt, retryAfter)
		log.Warnf(
			"Retrying ingest request (attempt=%d destination=%s topic=%s realm=%s result=retry delay=%s status=%d)",
			attempt, sanitizeDestination(u.baseURL), topic, realm, delay, status,
		)
		if !u.waitForRetry(delay) {
			return
		}
	}
}

func (u *httpUploader) doRequest(body []byte, topic string, realm string) (int, time.Duration, error) {
	fullURL := u.baseURL + "/" + topic
	req, err := http.NewRequestWithContext(u.ctx, http.MethodPost, fullURL, bytes.NewReader(body))
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", fmt.Sprintf("albiondata-client/%v", version))
	if u.authenticated {
		req.Header.Set("X-Albion-Server", realm)
	}
	if u.apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+u.apiToken)
	}

	resp, err := u.client.Do(req)
	if err != nil {
		return 0, 0, err
	}
	retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"), time.Now())
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
	return resp.StatusCode, retryAfter, nil
}

func (u *httpUploader) retryDelay(attempt int, retryAfter time.Duration) time.Duration {
	if retryAfter > 0 {
		if retryAfter > u.retry.maxDelay {
			return u.retry.maxDelay
		}
		return retryAfter
	}
	delay := u.retry.baseDelay << (attempt - 1)
	if delay > u.retry.maxDelay {
		delay = u.retry.maxDelay
	}
	// Jitter entre 50% e 100% preserva o teto e evita clientes sincronizados.
	return time.Duration(float64(delay) * (0.5 + rand.Float64()*0.5))
}

func (u *httpUploader) waitForRetry(delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-u.ctx.Done():
		return false
	}
}

func (u *httpUploader) close() {
	u.cancel()
	u.transport.CloseIdleConnections()
}

func isRetryableHTTPStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || (status >= 500 && status <= 599)
}

func parseRetryAfter(value string, now time.Time) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil {
		if seconds > 0 {
			return time.Duration(seconds) * time.Second
		}
		return 0
	}
	when, err := http.ParseTime(value)
	if err != nil || !when.After(now) {
		return 0
	}
	return when.Sub(now)
}
