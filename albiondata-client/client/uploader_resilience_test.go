package client

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type blockingUploader struct {
	started chan struct{}
	release chan struct{}
	closed  atomic.Bool
	once    sync.Once
}

func (u *blockingUploader) sendToIngest(_ []byte, _ string, _ uploadMetadata, _ string) {
	u.once.Do(func() { close(u.started) })
	<-u.release
}

func (u *blockingUploader) close() {
	if u.closed.CompareAndSwap(false, true) {
		close(u.release)
	}
}
func TestUploadQueueELimitadaENaoBloqueiaCaptura(t *testing.T) {
	underlying := &blockingUploader{started: make(chan struct{}), release: make(chan struct{})}
	queue := newQueuedUploader("http://user:secret@example.test?token=hidden", underlying, 2, 1)

	if !queue.enqueue([]byte("first"), "marketorders.ingest", &albionState{AODataServerID: 1}, "1") {
		t.Fatal("primeiro upload deveria entrar na fila")
	}
	select {
	case <-underlying.started:
	case <-time.After(time.Second):
		t.Fatal("worker nao iniciou")
	}

	if !queue.enqueue([]byte("second"), "marketorders.ingest", &albionState{AODataServerID: 1}, "2") {
		t.Fatal("segundo upload deveria entrar na fila")
	}
	if !queue.enqueue([]byte("third"), "marketorders.ingest", &albionState{AODataServerID: 1}, "3") {
		t.Fatal("terceiro upload deveria ocupar a ultima vaga")
	}
	if queue.enqueue([]byte("dropped"), "marketorders.ingest", &albionState{AODataServerID: 1}, "4") {
		t.Fatal("fila cheia aceitou upload em vez de descartar o mais novo")
	}
	if got := queue.stats.dropped.Load(); got != 1 {
		t.Fatalf("dropped=%d, esperado 1", got)
	}

	underlying.close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if !queue.shutdown(ctx) {
		t.Fatal("fila liberada nao drenou no prazo")
	}
}

func TestUploadQueueCancelaNoPrazoEFechaTransporte(t *testing.T) {
	underlying := &blockingUploader{started: make(chan struct{}), release: make(chan struct{})}
	queue := newQueuedUploader("http://example.test", underlying, 1, 1)
	queue.enqueue([]byte("blocked"), "marketorders.ingest", &albionState{AODataServerID: 1}, "1")
	<-underlying.started

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if queue.shutdown(ctx) {
		t.Fatal("shutdown bloqueado declarou drain completo")
	}
	if !underlying.closed.Load() {
		t.Fatal("shutdown por deadline nao fechou o transporte")
	}
}

func TestDispatcherReutilizaUploaderPorDestino(t *testing.T) {
	d := &dispatcher{uploaders: make(map[string]*queuedUploader)}
	first := d.uploaderFor("http://127.0.0.1:1")
	second := d.uploaderFor("http://127.0.0.1:1")
	if first == nil || first != second {
		t.Fatal("dispatcher criou mais de um uploader para o mesmo destino")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	d.shutdown(ctx)
}

func TestHTTPUploaderReutilizaConexaoEFechaIdleNoShutdown(t *testing.T) {
	var newConnections atomic.Int32
	var closedConnections atomic.Int32
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	srv.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		switch state {
		case http.StateNew:
			newConnections.Add(1)
		case http.StateClosed:
			closedConnections.Add(1)
		}
	}
	srv.Start()
	t.Cleanup(srv.Close)

	u := newHTTPUploader(srv.URL).(*httpUploader)
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", uploadMetadata{}, "1")
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", uploadMetadata{}, "2")
	if got := newConnections.Load(); got != 1 {
		t.Fatalf("duas requisicoes abriram %d conexoes; esperado reuso de uma", got)
	}

	u.close()
	deadline := time.Now().Add(time.Second)
	for closedConnections.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if closedConnections.Load() == 0 {
		t.Fatal("CloseIdleConnections nao fechou a conexao reutilizada")
	}
}

func TestHTTPUploaderRetrySomenteParaStatusTransitorios(t *testing.T) {
	var attempts atomic.Int32
	statuses := []int{
		http.StatusInternalServerError,
		http.StatusRequestTimeout,
		http.StatusTooManyRequests,
		http.StatusNoContent,
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		index := int(attempts.Add(1)) - 1
		w.WriteHeader(statuses[index])
	}))
	defer srv.Close()

	u := newHTTPUploader(srv.URL).(*httpUploader)
	u.retry = httpRetryPolicy{maxAttempts: 4, baseDelay: time.Millisecond, maxDelay: 2 * time.Millisecond}
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", uploadMetadata{}, "1")
	if got := attempts.Load(); got != 4 {
		t.Fatalf("attempts=%d, esperado 4", got)
	}
	u.close()
}

func TestHTTPUploaderRepeteTimeoutDeRede(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts.Add(1)
		time.Sleep(20 * time.Millisecond)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	u := newHTTPUploader(srv.URL).(*httpUploader)
	u.client.Timeout = 5 * time.Millisecond
	u.retry = httpRetryPolicy{maxAttempts: 3, baseDelay: time.Millisecond, maxDelay: time.Millisecond}
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", uploadMetadata{}, "1")
	if got := attempts.Load(); got != 3 {
		t.Fatalf("timeout gerou %d tentativas; esperado 3", got)
	}
	u.close()
}

func TestHTTPUploaderNaoRepeteErroDeContratoOuToken(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var attempts atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				attempts.Add(1)
				w.WriteHeader(status)
			}))
			defer srv.Close()

			u := newHTTPUploader(srv.URL).(*httpUploader)
			u.retry = httpRetryPolicy{maxAttempts: 4, baseDelay: time.Millisecond, maxDelay: time.Millisecond}
			u.sendToIngest([]byte(`{}`), "marketorders.ingest", uploadMetadata{}, "1")
			if got := attempts.Load(); got != 1 {
				t.Fatalf("status %d gerou %d tentativas; esperado 1", status, got)
			}
			u.close()
		})
	}
}

func TestParseRetryAfter(t *testing.T) {
	now := time.Date(2026, 8, 23, 12, 0, 0, 0, time.UTC)
	if got := parseRetryAfter("3", now); got != 3*time.Second {
		t.Fatalf("Retry-After em segundos=%s", got)
	}
	if got := parseRetryAfter(now.Add(4*time.Second).Format(http.TimeFormat), now); got != 4*time.Second {
		t.Fatalf("Retry-After em data=%s", got)
	}
	u := newHTTPUploader("http://example.test").(*httpUploader)
	u.retry.maxDelay = 5 * time.Second
	if got := u.retryDelay(1, 3*time.Second); got != 3*time.Second {
		t.Fatalf("uploader ignorou Retry-After: delay=%s", got)
	}
	u.close()
}

func TestDestinoDeLogRemoveCredenciais(t *testing.T) {
	got := sanitizeDestination("nats://user:secret@example.test:4222/path?token=hidden#fragment")
	if got != "nats://example.test:4222/path" {
		t.Fatalf("destino sanitizado=%q", got)
	}
}
