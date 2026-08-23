package client

type uploader interface {
	sendToIngest(body []byte, topic string, metadata uploadMetadata, identifier string)
}

// uploadMetadata e um snapshot pequeno e imutavel do estado necessario ao transporte.
// Nunca enfileirar albionState: ele contem o anel grande de correlacao de historico.
type uploadMetadata struct {
	serverID int
}

// PATCH LOCAL (Albion Profit Pro): uploaders que mantem conexoes implementam este ciclo
// de vida. A interface separada preserva os uploaders simples e os testes do fork.
type closeableUploader interface {
	uploader
	close()
}
