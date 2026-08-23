package main

import (
	"os"
	"os/exec"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ao-data/albiondata-client/client"
	"github.com/ao-data/albiondata-client/clientupdate"
	"github.com/ao-data/albiondata-client/log"
	"github.com/ao-data/albiondata-client/systray"

	"github.com/ao-data/go-githubupdate/updater"
)

// PATCH LOCAL (Albion Profit Pro): release metadata is injected through ldflags.
// Auto-update is an explicit opt-in and defaults to a fail-closed state.
var (
	version           = "dev"
	updateChannel     = clientupdate.DisabledChannel
	updateGithubOwner string
	updateGithubRepo  string
	restartInProgress atomic.Bool
	restartFinished   = make(chan struct{})
	restartFinishOnce sync.Once
)

func init() {
	client.ConfigGlobal.SetupFlags()
}

func main() {
	updateConfig, updateConfigErr := clientupdate.Resolve(
		version,
		updateChannel,
		updateGithubOwner,
		updateGithubRepo,
	)
	if updateConfigErr != nil {
		log.Errorf("Albion Profit Pro updater configuration rejected: %v", updateConfigErr)
	}
	version = updateConfig.Version()

	log.Infof(
		"Albion Profit Pro client: version=%s update_channel=%s updater=%s update_origin=%s",
		updateConfig.Version(),
		updateConfig.Channel(),
		updateConfig.State(),
		updateConfig.Origin(),
	)
	systray.SetBuildInfo(
		updateConfig.Version(),
		updateConfig.Channel(),
		updateConfig.State(),
	)

	if client.ConfigGlobal.PrintVersion {
		return
	}

	startUpdater(updateConfig)

	// log.Infof("Albion Data Client, version: %s", version)
	// log.Info("Client is currently broken after today's (2025-04-13) update. We are working on the issue. An update will be released when it is fixed. Please see https://www.albion-online-data.com/client/ for updates.")

	// On macOS, the systray requires the Cocoa event loop to run on the main thread.
	// So we run the client in a goroutine and systray on the main thread.
	// On other platforms, we do the opposite for backward compatibility.
	if runtime.GOOS == "darwin" {
		go runClient()
		systray.Run() // This blocks on the main thread (required for macOS)
	} else {
		go systray.Run()
		runClient()
	}
}

func runClient() {
	c := client.NewClient(version)
	err := c.Run()
	if err != nil {
		log.Error(err)
		log.Error("The program encountered an error. Press any key to close this window.")
		var b = make([]byte, 1)
		_, _ = os.Stdin.Read(b)
	}
	// O updater roda em outra goroutine. No Windows/Linux, runClient ocupa a main
	// goroutine; sem esta espera, o retorno apos o shutdown encerraria o processo antes
	// que o updater tivesse oportunidade de iniciar/substituir o executavel novo.
	if restartInProgress.Load() {
		<-restartFinished
	}
}

func startUpdater(config clientupdate.Config) {
	u, enabled := config.NewUpdater()
	if !enabled {
		return
	}

	go func() {
		for {
			if tryUpdate(u) {
				restartProcess()
				return // This line won't be reached if restart succeeds, but included for clarity
			}
			// Wait 1 hour before checking again
			time.Sleep(time.Hour)
		}
	}()
}

// tryUpdate attempts to check and apply an update with retry logic.
// Returns true if an update was successfully applied.
func tryUpdate(u *updater.Updater) bool {
	maxTries := 2
	for i := 0; i < maxTries; i++ {
		updated, err := u.BackgroundUpdater()
		if err != nil {
			log.Error(err.Error())
			if i < maxTries-1 {
				log.Info("Will try again in 60 seconds. You may need to run the client as Administrator.")
				time.Sleep(time.Second * 60)
			}
			continue
		}
		if updated {
			return true
		}
		// No update available, no need to retry
		return false
	}
	return false
}

// restartProcess replaces the current process with the updated version.
// On Unix systems (macOS/Linux), it uses syscall.Exec to seamlessly take over the terminal.
// On Windows, it starts a new process and exits since exec-style replacement isn't supported.
func restartProcess() {
	restartInProgress.Store(true)
	defer restartFinishOnce.Do(func() { close(restartFinished) })

	// PATCH LOCAL (Albion Profit Pro): pare captura e drene os uploaders antes de trocar
	// o executavel. O prazo impede que um backend indisponivel bloqueie a atualizacao.
	client.RequestShutdown(12 * time.Second)

	execPath, err := os.Executable()
	if err != nil {
		log.Errorf("Failed to get executable path for restart: %v", err)
		return
	}

	log.Info("Restarting with updated version...")

	if runtime.GOOS == "windows" {
		// Windows doesn't support exec-style process replacement
		// Start a new process and exit
		cmd := exec.Command(execPath, os.Args[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin

		err = cmd.Start()
		if err != nil {
			log.Errorf("Failed to start new process: %v", err)
			return
		}

		log.Info("New process started, exiting current process.")
		os.Exit(0)
	} else {
		// On Unix systems (macOS/Linux), use syscall.Exec to replace the current process
		// This seamlessly takes over the terminal - same PID, same terminal session
		err = syscall.Exec(execPath, os.Args, os.Environ())
		if err != nil {
			log.Errorf("Failed to exec new process: %v", err)
			// Fall back to starting a new process
			cmd := exec.Command(execPath, os.Args[1:]...)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			cmd.Stdin = os.Stdin
			_ = cmd.Start()
			cmd.Wait()
			os.Exit(0)
		}
		// If syscall.Exec succeeds, this line is never reached
		// because the current process is replaced
	}
}
