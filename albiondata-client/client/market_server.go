package client

// PATCH LOCAL (Albion Profit Pro): canonical market realm shared by capture and
// authenticated ingest. Unknown numeric IDs are never coerced to a default realm.
type AlbionServer string

const (
	AlbionServerWest   AlbionServer = "west"
	AlbionServerEast   AlbionServer = "east"
	AlbionServerEurope AlbionServer = "europe"
)

func albionServerFromID(serverID int) (AlbionServer, bool) {
	switch serverID {
	case 1:
		return AlbionServerWest, true
	case 2:
		return AlbionServerEast, true
	case 3:
		return AlbionServerEurope, true
	default:
		return "", false
	}
}
