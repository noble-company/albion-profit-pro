//go:build darwin

package systray

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/ao-data/albiondata-client/client"
	"github.com/ao-data/albiondata-client/icon"
	"github.com/ao-data/albiondata-client/log"
	"github.com/getlantern/systray"
)

var ConsoleHidden bool = false

const CanHideConsole = false

func HideConsole() {
	// Not supported on macOS
}

func ShowConsole() {
	// Not supported on macOS
}

func Run() {
	systray.Run(onReady, onExit)
}

func onExit() {
	// Cleanup if needed
}

func onReady() {
	systray.SetIcon(icon.Data)
	systray.SetTitle("") // Clear text since we have an icon now
	// PATCH LOCAL (Albion Profit Pro): make the build and updater state inspectable.
	systray.SetTooltip("Albion Profit Pro Client | " + buildInfoLabel())

	// PATCH LOCAL (Albion Profit Pro, task 3.6/14): entry point to the product comes first.
	// Disabled instead of hidden when no URL is configured -- fail-closed, never an arbitrary
	// destination, but still visible so the user knows the feature exists.
	mOpenCalculator := systray.AddMenuItem("Abrir Calculadora", "Open the Albion Profit Pro web calculator")
	if client.CalculatorURL() == "" {
		mOpenCalculator.Disable()
	}
	systray.AddSeparator()
	mBuildInfo := systray.AddMenuItem(buildInfoLabel(), "Compiled release and updater state")
	mBuildInfo.Disable()
	mConnection := systray.AddMenuItem("Connection: "+client.ConnectionStatusLabel(), "Backend authentication and realm state")
	mConnection.Disable()
	mReloadConfig := systray.AddMenuItem("Reload Configuration", "Reload config.yaml and revalidate backend access")
	systray.AddSeparator()
	mOpenLog := systray.AddMenuItem("Open Log File", "Open the log file in default viewer")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Close the Albion Data Client")

	go func() {
		for {
			select {
			case status := <-client.ConnectionStatusChanges():
				mConnection.SetTitle("Connection: " + status)
				systray.SetTooltip("Albion Profit Pro Client | " + status)
			case <-mOpenCalculator.ClickedCh:
				if url := client.CalculatorURL(); url != "" {
					openBrowser(url)
				}
			case <-mReloadConfig.ClickedCh:
				go client.RevalidateConnectionConfiguration()
			case <-mOpenLog.ClickedCh:
				openLogFile()

			case <-mQuit.ClickedCh:
				fmt.Println("Requesting quit")
				client.RequestShutdown(12 * time.Second)
				systray.Quit()
				return
			}
		}
	}()
}

func openLogFile() {
	// Try to find and open the log file
	logFile := "albiondata-client.log"

	// Check current directory first
	if _, err := os.Stat(logFile); err == nil {
		absPath, _ := filepath.Abs(logFile)
		cmd := exec.Command("open", absPath)
		if err := cmd.Start(); err != nil {
			log.Errorf("Failed to open log file: %v", err)
		}
		return
	}

	// If no log file exists, show a message
	log.Info("No log file found yet.")
}

// openBrowser opens the default browser at url. PATCH LOCAL (Albion Profit Pro, task 3.6/14):
// url comes from resolved config (flag/config.yaml/release ldflags), never from user input.
func openBrowser(url string) {
	cmd := exec.Command("open", url)
	if err := cmd.Start(); err != nil {
		log.Errorf("Failed to open calculator URL: %v", err)
	}
}
