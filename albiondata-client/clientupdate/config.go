package clientupdate

import (
	"fmt"
	"strings"

	"github.com/ao-data/go-githubupdate/updater"
	"github.com/blang/semver/v4"
)

// PATCH LOCAL (Albion Profit Pro): the distributed client must never trust an
// arbitrary GitHub repository as an executable update source. These values are
// deliberately compiled into the product and are not user-configurable.
const (
	DisabledChannel    = "disabled"
	GitHubChannel      = "github"
	AllowedGitHubOwner = "noble-company"
	AllowedGitHubRepo  = "albion-profit-pro"
)

// Config is the validated, fail-closed update configuration compiled into a build.
type Config struct {
	version string
	channel string
	owner   string
	repo    string
	state   string
}

// Resolve validates build metadata. On every error it returns a disabled config,
// so a caller cannot accidentally continue with an untrusted update origin.
func Resolve(version, channel, owner, repo string) (Config, error) {
	version = strings.TrimSpace(version)
	channel = strings.TrimSpace(channel)
	owner = strings.TrimSpace(owner)
	repo = strings.TrimSpace(repo)

	if version == "" {
		version = "dev"
	}

	switch channel {
	case DisabledChannel:
		if owner != "" || repo != "" {
			return disabled(version, "invalid configuration"), fmt.Errorf(
				"disabled update channel cannot define a GitHub origin",
			)
		}
		return disabled(version, "disabled by build configuration"), nil
	case GitHubChannel:
		if owner != AllowedGitHubOwner || repo != AllowedGitHubRepo {
			return disabled(version, "untrusted origin rejected"), fmt.Errorf(
				"untrusted update origin %q/%q", owner, repo,
			)
		}
		if _, err := semver.Make(version); err != nil {
			return disabled(version, "invalid version"), fmt.Errorf(
				"GitHub updater requires a semantic version without a v prefix: %w", err,
			)
		}
		return Config{
			version: version,
			channel: GitHubChannel,
			owner:   owner,
			repo:    repo,
			state:   "enabled",
		}, nil
	default:
		return disabled(version, "unknown channel rejected"), fmt.Errorf(
			"unknown update channel %q", channel,
		)
	}
}

func disabled(version, state string) Config {
	return Config{
		version: version,
		channel: DisabledChannel,
		state:   state,
	}
}

func (config Config) Version() string {
	return config.version
}

func (config Config) Channel() string {
	return config.channel
}

func (config Config) State() string {
	return config.state
}

func (config Config) Origin() string {
	if config.owner == "" || config.repo == "" {
		return "none"
	}
	return config.owner + "/" + config.repo
}

// NewUpdater only returns an updater after Resolve accepted the compiled channel.
func (config Config) NewUpdater() (*updater.Updater, bool) {
	if config.channel != GitHubChannel || config.state != "enabled" {
		return nil, false
	}
	return updater.NewUpdater(config.version, config.owner, config.repo, "update-"), true
}
