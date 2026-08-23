package client

import "testing"

// PATCH LOCAL (Albion Profit Pro): locks the upstream numeric server IDs to the
// textual values used by our HTTP, database and cache contracts.
func TestAlbionServerFromID(t *testing.T) {
	cases := []struct {
		id     int
		want   AlbionServer
		wantOK bool
	}{
		{id: 1, want: AlbionServerWest, wantOK: true},
		{id: 2, want: AlbionServerEast, wantOK: true},
		{id: 3, want: AlbionServerEurope, wantOK: true},
		{id: 0, wantOK: false},
		{id: 99, wantOK: false},
	}

	for _, testCase := range cases {
		got, ok := albionServerFromID(testCase.id)
		if got != testCase.want || ok != testCase.wantOK {
			t.Errorf("albionServerFromID(%d) = (%q, %v), want (%q, %v)",
				testCase.id, got, ok, testCase.want, testCase.wantOK)
		}
	}
}
