package client

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	clientlog "github.com/ao-data/albiondata-client/log"
)

func bootstrapTestServer(t *testing.T, status int, body string) (*httptest.Server, *string) {
	t.Helper()
	authorization := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		if r.URL.Path != "/client/me" {
			t.Errorf("bootstrap chamou path %q, esperado /client/me", r.URL.Path)
		}
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(server.Close)
	return server, &authorization
}

func controllerForTest(serverURL, token string) *bootstrapController {
	ctx, cancel := context.WithCancel(context.Background())
	return &bootstrapController{
		ctx:     ctx,
		cancel:  cancel,
		client:  &http.Client{Timeout: 200 * time.Millisecond},
		targets: []string{serverURL},
		token:   token,
	}
}

func TestNormalizeProfitProDestinationOnlyChangesScheme(t *testing.T) {
	got, authenticated, err := normalizeProfitProDestination(
		"https+token://api.example.com/http+token-value",
	)
	if err != nil || !authenticated {
		t.Fatalf("destino valido rejeitado: authenticated=%v err=%v", authenticated, err)
	}
	if got != "https://api.example.com/http+token-value" {
		t.Fatalf("normalizacao alterou texto fora do esquema: %q", got)
	}
	if stripTokenScheme("https+token://api.example.com/http+token") != "https://api.example.com/http+token" {
		t.Fatal("stripTokenScheme alterou texto fora do esquema")
	}
}

func TestNormalizeProfitProDestinationRejectsSensitiveURLParts(t *testing.T) {
	for _, target := range []string{
		"https+token://user:password@example.com",
		"https+token://example.com?token=secret",
		"https+token://example.com#secret",
		"ftp://example.com",
	} {
		if _, _, err := normalizeProfitProDestination(target); err == nil {
			t.Errorf("destino sensivel/invalido aceito: %s", target)
		}
	}
}

func TestBootstrapValidToken(t *testing.T) {
	server, authorization := bootstrapTestServer(
		t, http.StatusOK, `{"user_id":"00000000-0000-0000-0000-000000000001","email":"a@b.test","token_sufixo":"1234"}`,
	)
	controller := controllerForTest(server.URL, "apk_secret_1234")
	defer controller.cancel()
	if err := controller.validate(); err != nil {
		t.Fatalf("token valido rejeitado: %v", err)
	}
	if *authorization != "Bearer apk_secret_1234" {
		t.Fatalf("Authorization = %q", *authorization)
	}
}

func TestBootstrapUnauthorizedIsTerminal(t *testing.T) {
	server, _ := bootstrapTestServer(t, http.StatusUnauthorized, `{"detail":"revoked"}`)
	controller := controllerForTest(server.URL, "apk_revoked_9999")
	defer controller.cancel()
	err := controller.validate()
	if err == nil || err == errTransientBootstrap {
		t.Fatalf("401 deveria ser terminal, veio %v", err)
	}
}

func TestBootstrapServerFailureIsTransient(t *testing.T) {
	server, _ := bootstrapTestServer(t, http.StatusServiceUnavailable, `{}`)
	controller := controllerForTest(server.URL, "apk_secret_1234")
	defer controller.cancel()
	if err := controller.validate(); err != errTransientBootstrap {
		t.Fatalf("503 deveria ser transitorio, veio %v", err)
	}
}

func TestBootstrapTimeoutIsTransient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	controller := controllerForTest(server.URL, "apk_secret_1234")
	controller.client.Timeout = 10 * time.Millisecond
	defer controller.cancel()
	if err := controller.validate(); err != errTransientBootstrap {
		t.Fatalf("timeout deveria ser transitorio, veio %v", err)
	}
}

func TestMissingTokenBlocksAuthenticatedUploads(t *testing.T) {
	oldConfig := *ConfigGlobal
	oldProfile := buildProfile
	oldNotification := pushNotification
	t.Cleanup(func() {
		*ConfigGlobal = oldConfig
		buildProfile = oldProfile
		pushNotification = oldNotification
	})
	pushNotification = func(string) {}
	buildProfile = "release"
	ConfigGlobal.DisableUpload = false
	ConfigGlobal.PublicIngestBaseUrls = "https+token://api.example.com"
	ConfigGlobal.ApiToken = ""

	stop := startUploadBootstrap()
	defer stop()
	if authenticatedUploadsAllowed() {
		t.Fatal("upload autenticado liberado sem token")
	}
	if currentConnectionState() != ConnectionMissingToken {
		t.Fatalf("estado = %s, esperado token ausente", currentConnectionState())
	}
}

func TestBootstrapLogsNeverContainRawToken(t *testing.T) {
	server, _ := bootstrapTestServer(t, http.StatusOK, `{"token_sufixo":"1234"}`)
	oldConfig := *ConfigGlobal
	oldProfile := buildProfile
	oldNotification := pushNotification
	var captured bytes.Buffer
	clientlog.SetOutput(&captured)
	t.Cleanup(func() {
		*ConfigGlobal = oldConfig
		buildProfile = oldProfile
		pushNotification = oldNotification
		clientlog.SetOutput(os.Stderr)
	})
	pushNotification = func(string) {}
	buildProfile = "release"
	ConfigGlobal.DisableUpload = false
	ConfigGlobal.PublicIngestBaseUrls = strings.Replace(server.URL, "http://", "http+token://", 1)
	ConfigGlobal.ApiToken = "apk_never_log_this_1234"

	stop := startUploadBootstrap()
	stop()
	if strings.Contains(captured.String(), ConfigGlobal.ApiToken) {
		t.Fatalf("log vazou token cru: %s", captured.String())
	}
}
