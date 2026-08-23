package client

import (
	"context"
	"net/url"
	"sync"
	"sync/atomic"

	"github.com/ao-data/albiondata-client/log"
)

const (
	// PATCH LOCAL (Albion Profit Pro): limites deliberadamente pequenos e fixos. O dado de
	// mercado e regeneravel; preservar a captura e mais importante que acumular memoria
	// quando o backend esta indisponivel.
	defaultUploadQueueCapacity = 256
	// Um worker por destino preserva a ordem observada. Destinos diferentes continuam
	// concorrentes sem permitir que uma resposta antiga ultrapasse uma nova.
	defaultUploadWorkerCount = 1
)

type uploadJob struct {
	body       []byte
	topic      string
	metadata   uploadMetadata
	identifier string
}

type uploadQueueStats struct {
	queued    atomic.Uint64
	dropped   atomic.Uint64
	completed atomic.Uint64
}

type queuedUploader struct {
	destination string
	uploader    uploader
	jobs        chan uploadJob
	workers     sync.WaitGroup
	mu          sync.Mutex
	accepting   bool
	stats       uploadQueueStats
}

func newQueuedUploader(destination string, uploader uploader, capacity int, workerCount int) *queuedUploader {
	if capacity < 1 {
		capacity = 1
	}
	if workerCount < 1 {
		workerCount = 1
	}

	q := &queuedUploader{
		destination: sanitizeDestination(destination),
		uploader:    uploader,
		jobs:        make(chan uploadJob, capacity),
		accepting:   true,
	}
	q.workers.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		go q.runWorker()
	}
	return q
}

func (q *queuedUploader) runWorker() {
	defer q.workers.Done()
	for job := range q.jobs {
		q.uploader.sendToIngest(job.body, job.topic, job.metadata, job.identifier)
		q.stats.completed.Add(1)
	}
}

func (q *queuedUploader) enqueue(body []byte, topic string, state *albionState, identifier string) bool {
	// O worker nunca recebe o estado vivo do router. Alem de remover a data race, isto
	// impede que uma troca de realm altere o cabecalho de uma mensagem ja enfileirada.
	job := uploadJob{
		body:       append([]byte(nil), body...),
		topic:      topic,
		metadata:   uploadMetadata{serverID: state.AODataServerID},
		identifier: identifier,
	}

	q.mu.Lock()
	defer q.mu.Unlock()
	if !q.accepting {
		q.stats.dropped.Add(1)
		return false
	}

	select {
	case q.jobs <- job:
		q.stats.queued.Add(1)
		log.Debugf(
			"Upload enqueued (destination=%s topic=%s realm=%s queue=%d result=queued)",
			q.destination, topic, realmLabel(state.AODataServerID), len(q.jobs),
		)
		return true
	default:
		q.stats.dropped.Add(1)
		log.Warnf(
			"Upload queue full; dropping newest message (destination=%s topic=%s realm=%s queue=%d result=dropped)",
			q.destination, topic, realmLabel(state.AODataServerID), len(q.jobs),
		)
		return false
	}
}

func (q *queuedUploader) shutdown(ctx context.Context) bool {
	q.mu.Lock()
	if q.accepting {
		q.accepting = false
		close(q.jobs)
	}
	q.mu.Unlock()

	done := make(chan struct{})
	go func() {
		q.workers.Wait()
		close(done)
	}()

	select {
	case <-done:
		q.closeTransport()
		log.Infof(
			"Upload queue drained (destination=%s queued=%d completed=%d dropped=%d result=closed)",
			q.destination, q.stats.queued.Load(), q.stats.completed.Load(), q.stats.dropped.Load(),
		)
		return true
	case <-ctx.Done():
		q.closeTransport()
		log.Warnf(
			"Upload queue shutdown deadline reached (destination=%s queue=%d dropped=%d result=deadline)",
			q.destination, len(q.jobs), q.stats.dropped.Load(),
		)
		return false
	}
}

func (q *queuedUploader) closeTransport() {
	if closer, ok := q.uploader.(closeableUploader); ok {
		closer.close()
	}
}

func sanitizeDestination(destination string) string {
	parsed, err := url.Parse(destination)
	if err != nil {
		return "invalid-destination"
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func realmLabel(serverID int) string {
	if server, ok := albionServerFromID(serverID); ok {
		return string(server)
	}
	return "unknown"
}
