package systray

import "fmt"

// PATCH LOCAL (Albion Profit Pro): keep release identity visible in every tray
// implementation without coupling the systray package to package main.
type BuildInfo struct {
	Version       string
	UpdateChannel string
	UpdaterState  string
}

var currentBuildInfo = BuildInfo{
	Version:       "dev",
	UpdateChannel: "disabled",
	UpdaterState:  "not configured",
}

func SetBuildInfo(version, updateChannel, updaterState string) {
	currentBuildInfo = BuildInfo{
		Version:       version,
		UpdateChannel: updateChannel,
		UpdaterState:  updaterState,
	}
}

func buildInfoLabel() string {
	return fmt.Sprintf(
		"Version %s | updates: %s (%s)",
		currentBuildInfo.Version,
		currentBuildInfo.UpdateChannel,
		currentBuildInfo.UpdaterState,
	)
}
