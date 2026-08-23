package clientupdate

import "testing"

// PATCH LOCAL (Albion Profit Pro): regression coverage for the release boundary.
// A versioned build must be safe independently of whether its version is empty.
func TestUpdaterIsExplicitlyDisabledByDefault(t *testing.T) {
	config, err := Resolve("1.2.3", DisabledChannel, "", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if _, enabled := config.NewUpdater(); enabled {
		t.Fatal("versioned build unexpectedly enabled the updater")
	}
	if config.Channel() != DisabledChannel {
		t.Fatalf("Channel() = %q, want %q", config.Channel(), DisabledChannel)
	}
}

func TestUpdaterRejectsUpstreamOrigin(t *testing.T) {
	config, err := Resolve("1.2.3", GitHubChannel, "ao-data", "albiondata-client")
	if err == nil {
		t.Fatal("Resolve() accepted the upstream executable origin")
	}
	if _, enabled := config.NewUpdater(); enabled {
		t.Fatal("rejected upstream origin still created an updater")
	}
	if config.Origin() != "none" {
		t.Fatalf("Origin() = %q, want fail-closed origin", config.Origin())
	}
}

func TestUpdaterAcceptsOnlyProfitProOrigin(t *testing.T) {
	config, err := Resolve(
		"1.2.3",
		GitHubChannel,
		AllowedGitHubOwner,
		AllowedGitHubRepo,
	)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	resolved, enabled := config.NewUpdater()
	if !enabled {
		t.Fatal("trusted Profit Pro channel did not create an updater")
	}
	if resolved.GithubOwner != AllowedGitHubOwner || resolved.GithubRepo != AllowedGitHubRepo {
		t.Fatalf("updater origin = %s/%s", resolved.GithubOwner, resolved.GithubRepo)
	}
}

func TestUpdaterRejectsInvalidEnabledBuildVersion(t *testing.T) {
	config, err := Resolve("dev", GitHubChannel, AllowedGitHubOwner, AllowedGitHubRepo)
	if err == nil {
		t.Fatal("Resolve() accepted a non-semantic enabled build version")
	}
	if _, enabled := config.NewUpdater(); enabled {
		t.Fatal("invalid version still created an updater")
	}
}
