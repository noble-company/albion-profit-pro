package client

import (
	"time"

	"github.com/ao-data/albiondata-client/log"
)

type albionProcessWatcher struct {
	known     []int
	devices   []string
	listeners map[int][]*listener
	quit      chan bool
	r         *Router
}

func newAlbionProcessWatcher() *albionProcessWatcher {
	return &albionProcessWatcher{
		listeners: make(map[int][]*listener),
		quit:      make(chan bool),
		r:         newRouter(),
	}
}

func (apw *albionProcessWatcher) run(stop <-chan struct{}) error {
	log.Print("Watching Albion")
	physicalInterfaces, err := getAllPhysicalInterface()
	if err != nil {
		return err
	}
	apw.devices = physicalInterfaces
	log.Debugf("Will listen to these devices: %v", apw.devices)
	go apw.r.run()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-apw.quit:
			apw.closeWatcher()
			return nil
		case <-stop:
			apw.closeWatcher()
			return nil
		case <-ticker.C:
			if len(apw.listeners) == 0 {
				apw.createListeners()
			}
		}
	}
}

func (apw *albionProcessWatcher) closeWatcher() {
	log.Print("Albion watcher closed")

	for port := range apw.listeners {
		for _, l := range apw.listeners[port] {
			l.stop()
		}

		delete(apw.listeners, port)
	}

	apw.r.shutdown()
}

func (apw *albionProcessWatcher) createListeners() {
	filtered := [1]int{5056} // keep overdesign to listen on many ports

	for _, port := range filtered {
		for _, device := range apw.devices {
			l := newListener(apw.r)
			go l.startOnline(device, port)

			apw.listeners[port] = append(apw.listeners[port], l)
		}
	}
}
