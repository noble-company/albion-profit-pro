package client

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/ao-data/albiondata-client/log"

	"github.com/mattn/go-colorable"
	"github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

const (
	logFileName = "albiondata-client.log"
	maxLogFiles = 10
)

// PATCH LOCAL (Albion Profit Pro): go build local continua conveniente, mas artefatos de
// release recebem buildProfile=release via ldflags. Sem URL oficial injetada ou configurada,
// release inicia fail-closed e nunca tenta localhost silenciosamente.
const developmentPublicIngestBaseURL = "http+token://localhost:8000"

// PATCH LOCAL (Albion Profit Pro): mesma logica do destino de ingest acima, task 3.6/14 --
// "Abrir Calculadora" no systray. Release sem URL injetada fica com o item desabilitado em vez
// de abrir um host arbitrario ou cair silenciosamente em localhost.
const developmentCalculatorURL = "http://localhost:5173"

var (
	buildProfile               = "development"
	releasePublicIngestBaseURL string
	releaseCalculatorURL       string
)

// ansiStripWriter wraps an io.Writer and strips ANSI escape codes before writing
type ansiStripWriter struct {
	writer io.Writer
	regex  *regexp.Regexp
}

// newAnsiStripWriter creates a writer that strips ANSI escape codes
func newAnsiStripWriter(w io.Writer) *ansiStripWriter {
	return &ansiStripWriter{
		writer: w,
		// Matches ANSI escape sequences like \x1b[0m, \x1b[36m, etc.
		regex: regexp.MustCompile(`\x1b\[[0-9;]*m`),
	}
}

func (w *ansiStripWriter) Write(p []byte) (n int, err error) {
	stripped := w.regex.ReplaceAll(p, []byte{})
	_, err = w.writer.Write(stripped)
	// Return original length to satisfy io.Writer contract
	return len(p), err
}

type config struct {
	AllowedWSHosts []string
	// PATCH LOCAL (Albion Profit Pro): token de API do nosso backend de ingest.
	// NUNCA logar o valor -- setupLogs() tee-a todo log pro albiondata-client.log,
	// que fica no disco do usuario. Usar tokenSufixo() para diagnostico.
	ApiToken string
	// origem do token ("flag -token" / "config.yaml"), so para diagnostico no log
	apiTokenOrigem     string
	publicIngestOrigem string
	apiTokenFlag       string
	publicIngestFlag   string
	disableUploadFlag  bool
	// PATCH LOCAL (Albion Profit Pro): URL do calculadora web, task 3.6/14.
	CalculatorUrl                  string
	calculatorUrlOrigem            string
	calculatorUrlFlag              string
	Debug                          bool
	Trace                          bool
	DebugEvents                    map[int]bool
	DebugEventsString              string
	DebugEventsBlacklistString     string
	DebugOperations                map[int]bool
	DebugOperationsString          string
	DebugOperationsBlacklistString string
	DebugIgnoreDecodingErrors      bool
	DisableUpload                  bool
	EnableWebsockets               bool
	ListenDevices                  string
	LogLevel                       string
	Minimize                       bool
	Offline                        bool
	OfflinePath                    string
	RecordPath                     string
	PrivateIngestBaseUrls          string
	PublicIngestBaseUrls           string
	NoCPULimit                     bool
	PrintVersion                   bool
}

// config global config data
var ConfigGlobal = &config{
	LogLevel: "INFO"}

var connectionConfigMu sync.RWMutex

func (config *config) SetupFlags() {
	config.setupWebsocketFlags()
	config.setupDebugFlags()
	config.setupCommonFlags()

	flag.Parse()
	config.apiTokenFlag = config.ApiToken
	config.publicIngestFlag = config.PublicIngestBaseUrls
	config.disableUploadFlag = config.DisableUpload
	config.calculatorUrlFlag = config.CalculatorUrl

	// PATCH LOCAL (Albion Profit Pro): resolucao do token tem que acontecer AQUI, depois
	// do flag.Parse(). setupWebsocketFlags() le o viper la em cima, antes das flags sequer
	// existirem -- resolver antes faria o default vazio da flag sobrescrever o valor do
	// config.yaml no Parse.
	config.ApiToken, config.apiTokenOrigem = resolveApiToken(config.ApiToken, viper.GetString("ApiToken"))
	config.PublicIngestBaseUrls, config.publicIngestOrigem = resolvePublicIngestBaseURLs(
		config.PublicIngestBaseUrls,
		viper.GetString("PublicIngestBaseUrls"),
		buildProfile,
		releasePublicIngestBaseURL,
	)
	if strings.EqualFold(buildProfile, "release") && config.PublicIngestBaseUrls == "" {
		config.DisableUpload = true
	}
	config.CalculatorUrl, config.calculatorUrlOrigem = resolveCalculatorURL(
		config.CalculatorUrl,
		viper.GetString("CalculatorUrl"),
		buildProfile,
		releaseCalculatorURL,
	)

	if config.OfflinePath != "" {
		config.Offline = true
		config.DisableUpload = true

		if config.PublicIngestBaseUrls == "http+pow://west.aodp.local:3000" {
			config.DisableUpload = false
		}

		log.Infof("config.PublicIngestBaseUrls: %v", sanitizeTargetsForLog(config.PublicIngestBaseUrls))
		log.Infof("config.DisableUpload: %v", config.DisableUpload)
	}

	if config.DisableUpload {
		log.Info("Upload is disabled.")
	}

	config.setupLogs()

	// PATCH LOCAL (Albion Profit Pro): depois do setupLogs() de proposito, pra respeitar
	// nivel e destino de log ja configurados. So o sufixo -- nunca o token inteiro.
	if config.ApiToken != "" {
		log.Infof("Albion Profit Pro: token de API carregado de %v (final ...%v)",
			config.apiTokenOrigem, tokenSufixo(config.ApiToken))
	}
	if config.PublicIngestBaseUrls != "" {
		log.Infof("Albion Profit Pro: destino de ingest carregado de %v (%v)",
			config.publicIngestOrigem, sanitizeTargetsForLog(config.PublicIngestBaseUrls))
	} else if strings.EqualFold(buildProfile, "release") {
		log.Warn("Albion Profit Pro: release sem destino de ingest; uploads permanecem desabilitados ate configurar PublicIngestBaseUrls ou -i.")
	}
	if config.CalculatorUrl != "" {
		log.Infof("Albion Profit Pro: URL da calculadora carregada de %v (%v)",
			config.calculatorUrlOrigem, config.CalculatorUrl)
	} else if strings.EqualFold(buildProfile, "release") {
		log.Warn("Albion Profit Pro: release sem URL da calculadora; o item 'Abrir Calculadora' do systray fica desabilitado ate configurar CalculatorUrl ou -calculator-url.")
	}
}

func configuredConnection() (targets, token string, disabled bool) {
	connectionConfigMu.RLock()
	defer connectionConfigMu.RUnlock()
	return ConfigGlobal.PublicIngestBaseUrls, ConfigGlobal.ApiToken, ConfigGlobal.DisableUpload
}

// CalculatorURL retorna a URL resolvida da calculadora web, ou vazio se nenhuma estiver
// configurada. PATCH LOCAL (Albion Profit Pro, task 3.6/14): o systray usa isto para decidir se
// o item "Abrir Calculadora" fica habilitado -- release sem URL explicita nunca abre um destino
// arbitrario.
func CalculatorURL() string {
	connectionConfigMu.RLock()
	defer connectionConfigMu.RUnlock()
	return ConfigGlobal.CalculatorUrl
}

func reloadConnectionConfigFromFile() error {
	if err := viper.ReadInConfig(); err != nil {
		return err
	}
	token, tokenOrigin := resolveApiToken(ConfigGlobal.apiTokenFlag, viper.GetString("ApiToken"))
	targets, targetOrigin := resolvePublicIngestBaseURLs(
		ConfigGlobal.publicIngestFlag,
		viper.GetString("PublicIngestBaseUrls"),
		buildProfile,
		releasePublicIngestBaseURL,
	)
	disabled := ConfigGlobal.disableUploadFlag ||
		(strings.EqualFold(buildProfile, "release") && targets == "")
	calculatorURL, calculatorOrigin := resolveCalculatorURL(
		ConfigGlobal.calculatorUrlFlag,
		viper.GetString("CalculatorUrl"),
		buildProfile,
		releaseCalculatorURL,
	)

	connectionConfigMu.Lock()
	ConfigGlobal.ApiToken = token
	ConfigGlobal.apiTokenOrigem = tokenOrigin
	ConfigGlobal.PublicIngestBaseUrls = targets
	ConfigGlobal.publicIngestOrigem = targetOrigin
	ConfigGlobal.DisableUpload = disabled
	ConfigGlobal.CalculatorUrl = calculatorURL
	ConfigGlobal.calculatorUrlOrigem = calculatorOrigin
	connectionConfigMu.Unlock()
	return nil
}

// resolveApiToken decide de onde vem o token: flag vence config.yaml, config.yaml vence
// vazio. Extraida do SetupFlags pra ser testavel sem mexer no flag.CommandLine global.
func resolveApiToken(fromFlag string, fromFile string) (token string, origem string) {
	if fromFlag != "" {
		return fromFlag, "flag -token"
	}
	if fromFile != "" {
		return fromFile, "config.yaml"
	}
	return "", ""
}

func resolvePublicIngestBaseURLs(fromFlag, fromFile, profile, releaseDefault string) (string, string) {
	if strings.TrimSpace(fromFlag) != "" {
		return strings.TrimSpace(fromFlag), "flag -i"
	}
	if strings.TrimSpace(fromFile) != "" {
		return strings.TrimSpace(fromFile), "config.yaml"
	}
	if strings.EqualFold(profile, "release") {
		if strings.TrimSpace(releaseDefault) != "" {
			return strings.TrimSpace(releaseDefault), "build de release"
		}
		return "", "release sem destino"
	}
	return developmentPublicIngestBaseURL, "default de desenvolvimento"
}

// resolveCalculatorURL espelha resolvePublicIngestBaseURLs: flag vence config.yaml, config.yaml
// vence o default do perfil, e release sem nada explicito fica vazio -- nunca herda o default de
// desenvolvimento silenciosamente.
func resolveCalculatorURL(fromFlag, fromFile, profile, releaseDefault string) (string, string) {
	if strings.TrimSpace(fromFlag) != "" {
		return strings.TrimSpace(fromFlag), "flag -calculator-url"
	}
	if strings.TrimSpace(fromFile) != "" {
		return strings.TrimSpace(fromFile), "config.yaml"
	}
	if strings.EqualFold(profile, "release") {
		if strings.TrimSpace(releaseDefault) != "" {
			return strings.TrimSpace(releaseDefault), "build de release"
		}
		return "", "release sem URL configurada"
	}
	return developmentCalculatorURL, "default de desenvolvimento"
}

func sanitizeTargetsForLog(targets string) string {
	if strings.TrimSpace(targets) == "" {
		return "disabled"
	}
	parts := strings.Split(targets, ",")
	for i, target := range parts {
		parts[i] = sanitizeDestination(strings.TrimSpace(target))
	}
	return strings.Join(parts, ",")
}

// tokenSufixo devolve os 4 ultimos caracteres do token para log/diagnostico, sem expor o
// valor -- mesma ideia do token_sufixo que o backend guarda para exibir na UI.
func tokenSufixo(token string) string {
	if len(token) < 4 {
		return "????"
	}
	return token[len(token)-4:]
}

func (config *config) setupWebsocketFlags() {
	// Setup the config file and parse values
	viper.SetConfigName("config")
	viper.AddConfigPath(".")
	// PATCH LOCAL (Albion Profit Pro): tambem procurar ao lado do binario. So o CWD era
	// registrado, entao quem abre o client por atalho (CWD != pasta do exe) tinha o
	// config.yaml -- e o ApiToken dentro dele -- ignorado em silencio.
	if exePath, exeErr := os.Executable(); exeErr == nil {
		viper.AddConfigPath(filepath.Dir(exePath))
	}
	err := viper.ReadInConfig()

	// if we cannot find the configuration file, set Websockets to false
	if err != nil {
		viper.Set("EnableWebsockets", false)
	}

	config.EnableWebsockets = viper.GetBool("EnableWebsockets")
	config.AllowedWSHosts = viper.GetStringSlice("AllowedWebsocketHosts")

}

func (config *config) setupDebugFlags() {
	flag.BoolVar(
		&config.PrintVersion,
		"version",
		false,
		"Print version, then close.",
	)

	flag.BoolVar(
		&config.Debug,
		"debug",
		false,
		"Enable debug logging.",
	)

	flag.BoolVar(
		&config.Trace,
		"trace",
		false,
		"Enable trace logging. Even more verbose than debug.",
	)

	flag.StringVar(
		&config.DebugEventsString,
		"events",
		"",
		"Whitelist of event IDs to output messages when debugging. Comma separated.",
	)

	flag.StringVar(
		&config.DebugEventsBlacklistString,
		"events-ignore",
		"",
		"Blacklist of event IDs to hide messages when debugging. Comma separated.",
	)

	flag.StringVar(
		&config.DebugOperationsString,
		"operations",
		"",
		"Whitelist of operation IDs to output messages when debugging. Comma separated.",
	)

	flag.StringVar(
		&config.DebugOperationsBlacklistString,
		"operations-ignore",
		"",
		"Blacklist of operation IDs to hide messages when debugging. Comma separated.",
	)

	flag.BoolVar(
		&config.DebugIgnoreDecodingErrors,
		"ignore-decode-errors",
		false,
		"Ignore the decoding errors when debugging",
	)

	flag.BoolVar(
		&config.NoCPULimit,
		"no-limit",
		false,
		"Use all available CPU cores",
	)

}

func (config *config) setupCommonFlags() {
	flag.BoolVar(
		&config.DisableUpload,
		"d",
		false,
		"If specified no attempts will be made to upload data to remote server.",
	)

	flag.StringVar(
		&config.ListenDevices,
		"l",
		"",
		"Listen on this comma separated devices instead of all available. (Windows: Use MAC-Address, Linux: Use interface name)",
	)

	flag.StringVar(
		&config.OfflinePath,
		"o",
		"",
		"Parses a local file instead of checking albion ports.",
	)

	flag.BoolVar(
		&config.Minimize,
		"minimize",
		false,
		"Automatically minimize the window.",
	)

	flag.StringVar(
		&config.PublicIngestBaseUrls,
		"i",
		"", // PATCH LOCAL: resolvido depois do Parse conforme perfil/flag/config.yaml
		"Base URL to send PUBLIC data to: 'http(s)+token://' (Albion Profit Pro, authenticated), 'http(s)+pow://', 'http(s)://', 'nats://' or 'noop'. Multiple uploaders, comma separated.",
	)

	flag.StringVar(
		&config.PrivateIngestBaseUrls,
		"p",
		"",
		"Base URL to send PRIVATE data to, can be 'nats://', 'http://', 'https://' or 'noop' and can have multiple uploaders. Comma separated.",
	)

	// PATCH LOCAL (Albion Profit Pro): token de API do nosso ingest. O config.yaml e o
	// lugar preferido -- flag aparece na lista de processos e no historico do shell.
	flag.StringVar(
		&config.ApiToken,
		"token",
		"",
		"Albion Profit Pro API token. Prefer setting ApiToken in config.yaml -- a flag is visible in the process list.",
	)

	flag.StringVar(
		&config.RecordPath,
		"record",
		"",
		"Enable recording commands to a file for debugging later.",
	)

	// PATCH LOCAL (Albion Profit Pro): URL da calculadora web pro item "Abrir Calculadora" do
	// systray. Prefer setting CalculatorUrl in config.yaml, mesma razao do -token.
	flag.StringVar(
		&config.CalculatorUrl,
		"calculator-url",
		"",
		"URL of the Albion Profit Pro web calculator to open from the systray. Prefer setting CalculatorUrl in config.yaml.",
	)
}

func (config *config) setupLogs() {
	if config.Debug {
		config.LogLevel = "DEBUG"
	}
	if config.Trace {
		config.LogLevel = "TRACE"
	}

	level, err := logrus.ParseLevel(strings.ToLower(config.LogLevel))
	if err != nil {
		log.Errorf("Error getting level: %v", err)
	}

	log.SetLevel(level)

	// Rotate existing log files before creating new one
	rotateLogFiles()

	// Always log to both file and terminal
	// Use colors for terminal, strip ANSI codes for file
	log.SetFormatter(&logrus.TextFormatter{FullTimestamp: true, DisableSorting: true, ForceColors: true})
	f, err := os.OpenFile(logFileName, os.O_WRONLY|os.O_TRUNC|os.O_CREATE, 0644)
	if err == nil {
		// Wrap file writer to strip ANSI codes
		strippedFileWriter := newAnsiStripWriter(f)
		multiWriter := io.MultiWriter(colorable.NewColorableStdout(), strippedFileWriter)
		log.SetOutput(multiWriter)
	} else {
		log.SetOutput(colorable.NewColorableStdout())
		log.Warnf("Could not create log file: %v", err)
	}
}

// rotateLogFiles moves the current log file to a numbered backup and removes old backups
func rotateLogFiles() {
	// Check if current log file exists
	if _, err := os.Stat(logFileName); os.IsNotExist(err) {
		return // No log file to rotate
	}

	// Remove the oldest log file if we're at the limit
	oldestLog := fmt.Sprintf("%s.%d", logFileName, maxLogFiles)
	_ = os.Remove(oldestLog)

	// Shift all existing log files up by one number
	for i := maxLogFiles - 1; i >= 1; i-- {
		oldName := fmt.Sprintf("%s.%d", logFileName, i)
		newName := fmt.Sprintf("%s.%d", logFileName, i+1)
		_ = os.Rename(oldName, newName)
	}

	// Rename current log file to .1
	_ = os.Rename(logFileName, fmt.Sprintf("%s.1", logFileName))
}

// GetLogFilePath returns the full path to the current log file
func GetLogFilePath() string {
	absPath, err := filepath.Abs(logFileName)
	if err != nil {
		return logFileName
	}
	return absPath
}

func (config *config) setupDebugEvents() {
	config.DebugEvents = make(map[int]bool)
	if config.DebugEventsString != "" {
		for _, event := range strings.Split(config.DebugEventsString, ",") {
			number, err := strconv.Atoi(event)
			if err == nil {
				config.DebugEvents[number] = true
			}
		}
	}
	if config.DebugEventsBlacklistString != "" {
		for _, event := range strings.Split(config.DebugEventsBlacklistString, ",") {
			number, err := strconv.Atoi(event)
			if err == nil {
				config.DebugEvents[number] = false
			}
		}
	}

	// Looping through map keys is purposefully random by design in Go
	for number, shouldDebug := range config.DebugEvents {
		verb := "Ignoring"
		if shouldDebug {
			verb = "Showing"
		}
		log.Debugf("[%v] event: [%v]%v", verb, number, EventType(number))
	}

}

func (config *config) setupDebugOperations() {
	config.DebugOperations = make(map[int]bool)
	if config.DebugOperationsString != "" {
		for _, operation := range strings.Split(config.DebugOperationsString, ",") {
			number, err := strconv.Atoi(operation)
			if err == nil {
				config.DebugOperations[number] = true
			}
		}
	}

	if config.DebugOperationsBlacklistString != "" {
		for _, operation := range strings.Split(config.DebugOperationsBlacklistString, ",") {
			number, err := strconv.Atoi(operation)
			if err == nil {
				config.DebugOperations[number] = false
			}
		}
	}

	// Looping through map keys is purposefully random by design in Go
	for number, shouldDebug := range config.DebugOperations {
		verb := "Ignoring"
		if shouldDebug {
			verb = "Showing"
		}
		log.Debugf("[%v] operation: [%v]%v", verb, number, OperationType(number))
	}

}
