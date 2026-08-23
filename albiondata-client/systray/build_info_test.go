package systray

import (
	"strings"
	"testing"
)

// PATCH LOCAL (Albion Profit Pro): the tray must expose enough release identity
// to diagnose a build without ever including API-token configuration.
func TestBuildInfoLabel(t *testing.T) {
	SetBuildInfo("1.2.3", "disabled", "disabled by build configuration")

	label := buildInfoLabel()
	for _, expected := range []string{"1.2.3", "disabled", "disabled by build configuration"} {
		if !strings.Contains(label, expected) {
			t.Fatalf("buildInfoLabel() = %q, missing %q", label, expected)
		}
	}
	if strings.Contains(strings.ToLower(label), "token") {
		t.Fatalf("buildInfoLabel() unexpectedly mentions token data: %q", label)
	}
}
