//go:build windows

package systray

import (
	"fmt"
	"time"

	"github.com/ao-data/albiondata-client/client"

	"github.com/ao-data/albiondata-client/icon"
	"github.com/getlantern/systray"
	"github.com/gonutz/w32"
)

var consoleHidden bool

func hideConsole() {
	console := w32.GetConsoleWindow()
	if console != 0 {
		_, consoleProcID := w32.GetWindowThreadProcessId(console)
		if w32.GetCurrentProcessId() == consoleProcID {
			w32.ShowWindowAsync(console, w32.SW_HIDE)
		}
	}

	consoleHidden = true
}

func showConsole() {
	console := w32.GetConsoleWindow()
	if console != 0 {
		_, consoleProcID := w32.GetWindowThreadProcessId(console)
		if w32.GetCurrentProcessId() == consoleProcID {
			w32.ShowWindowAsync(console, w32.SW_SHOW)
		}
	}

	consoleHidden = false
}

func GetActionTitle() string {
	if consoleHidden {
		return "Show Console"
	} else {
		return "Hide Console"
	}
}

func Run() {
	systray.Run(onReady, onExit)
}

func onExit() {

}

func onReady() {
	// Don't hide the console automatically
	// Unless started from the scheduled task or with the parameter
	// People think it is crashing
	if client.ConfigGlobal.Minimize {
		hideConsole()
	}
	systray.SetIcon(icon.Data)
	// PATCH LOCAL (Albion Profit Pro): make the build and updater state inspectable.
	systray.SetTitle("Albion Profit Pro Client")
	systray.SetTooltip("Albion Profit Pro Client | " + buildInfoLabel())
	mBuildInfo := systray.AddMenuItem(buildInfoLabel(), "Compiled release and updater state")
	mBuildInfo.Disable()
	mConnection := systray.AddMenuItem("Connection: "+client.ConnectionStatusLabel(), "Backend authentication and realm state")
	mConnection.Disable()
	mReloadConfig := systray.AddMenuItem("Reload Configuration", "Reload config.yaml and revalidate backend access")
	systray.AddSeparator()
	mConHideShow := systray.AddMenuItem(GetActionTitle(), "Show/Hide Console")
	mQuit := systray.AddMenuItem("Quit", "Close the Albion Data Client")

	func() {
		for {
			select {
			case status := <-client.ConnectionStatusChanges():
				mConnection.SetTitle("Connection: " + status)
				systray.SetTooltip("Albion Profit Pro Client | " + status)
			case <-mReloadConfig.ClickedCh:
				go client.RevalidateConnectionConfiguration()
			case <-mQuit.ClickedCh:
				fmt.Println("Requesting quit")
				client.RequestShutdown(12 * time.Second)
				systray.Quit()
				fmt.Println("Finished quitting")
				return

			case <-mConHideShow.ClickedCh:
				if consoleHidden == true {
					showConsole()
					mConHideShow.SetTitle(GetActionTitle())
				} else {
					hideConsole()
					mConHideShow.SetTitle(GetActionTitle())
				}
			}
		}
	}()
}
