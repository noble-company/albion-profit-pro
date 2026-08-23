package client

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"runtime"
	"strconv"
	"strings"

	"github.com/ao-data/albiondata-client/log"
)

type httpUploaderPow struct {
	baseURL   string
	transport *http.Transport
	client    *http.Client
	ctx       context.Context
	cancel    context.CancelFunc
}

type Pow struct {
	Key    string `json:"key"`
	Wanted string `json:"wanted"`
}

// newHTTPUploaderPow creates a new HTTP uploader
func newHTTPUploaderPow(url string) uploader {

	if !ConfigGlobal.NoCPULimit {
		// Limit to 25% of available cpu cores
		procs := runtime.NumCPU() / 4
		if procs < 1 {
			procs = 1
		}
		runtime.GOMAXPROCS(procs)
	}

	url = strings.Replace(url, "https+pow", "https", -1)
	url = strings.Replace(url, "http+pow", "http", -1)

	transport := &http.Transport{}
	ctx, cancel := context.WithCancel(context.Background())
	return &httpUploaderPow{
		baseURL:   url,
		transport: transport,
		client:    &http.Client{Transport: transport, Timeout: ingestRequestTimeout},
		ctx:       ctx,
		cancel:    cancel,
	}
}

func (u *httpUploaderPow) getPow(target interface{}) bool {
	log.Debugf("GETTING POW")
	fullURL := u.baseURL + "/pow"

	req, err := http.NewRequestWithContext(u.ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		log.Errorf("Error creating Pow Get request: %v", err)
		return false
	}
	req.Header.Add("User-Agent", fmt.Sprintf("albiondata-client/%v", version))
	resp, err := u.client.Do(req)

	if err != nil {
		log.Errorf("Error in Pow Get request: %v", err)
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Errorf("Got bad response code: %v", resp.StatusCode)
		return false
	}

	err = json.NewDecoder(resp.Body).Decode(target)
	if err != nil {
		log.Errorf("Error in parsing Pow Get request: %v", err)
		return false
	}
	return true
}

// Proves to the server that a pow was solved by submitting
// the pow's key, the solution and a nats msg as a POST request
// the topic becomes part of the URL
func (u *httpUploaderPow) uploadWithPow(pow Pow, solution string, natsmsg []byte, topic string, serverid int, identifier string) {

	fullURL := u.baseURL + "/pow/" + topic

	data := url.Values{
		"key":        {pow.Key},
		"solution":   {solution},
		"serverid":   {strconv.Itoa(serverid)},
		"natsmsg":    {string(natsmsg)},
		"identifier": {string(identifier)},
	}
	req, err := http.NewRequestWithContext(u.ctx, http.MethodPost, fullURL, strings.NewReader(data.Encode()))
	if err != nil {
		log.Errorf("Error creating Pow upload request: %v", err)
		return
	}
	req.Header.Add("User-Agent", fmt.Sprintf("albiondata-client/%v", version))
	resp, err := u.client.Do(req)

	if err != nil {
		log.Errorf("Error while proving pow: %v", err)
		return
	}

	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			log.Errorf("Could not read Pow error response: %v", err)
			return
		}
		log.Errorf("HTTP Error while proving pow. returned: %v (%v)", resp.StatusCode, string(body))
		return
	}

	log.Infof("Successfully sent ingest request to %v", u.baseURL)
}

// Generates a random hex string e.g.: faa2743d9181dca5
func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	dst := make([]byte, n*2)
	hex.Encode(dst, b)
	return string(dst)
}

// Converts a string to bits e.g.: 0110011...
func toBinaryBytes(s string) string {
	var buffer bytes.Buffer
	for i := 0; i < len(s); i++ {
		fmt.Fprintf(&buffer, "%08b", s[i])
	}
	return fmt.Sprintf("%s", buffer.Bytes())
}

// Solves a pow looping through possible solutions
// until a correct one is found
// returns the solution
func solvePow(pow Pow) string {
	wantedLen := len(pow.Wanted)
	var hexBuf [64]byte
	var binBuf [512]byte

	prefix := "aod^"
	sep := "^"
	for {
		randhex := randomHex(16)
		challenge := prefix + randhex + sep + pow.Key
		hash := sha256.Sum256([]byte(challenge))
		hex.Encode(hexBuf[:], hash[:])

		idx := 0
		for i := 0; i < 64; i++ {
			b := hexBuf[i]
			for j := 7; j >= 0; j-- {
				if (b>>j)&1 == 1 {
					binBuf[idx] = '1'
				} else {
					binBuf[idx] = '0'
				}
				idx++
				if idx >= wantedLen {
					break
				}
			}
			if idx >= wantedLen {
				break
			}
		}
		if string(binBuf[:wantedLen]) == pow.Wanted {
			return randhex
		}
	}
}

func (u *httpUploaderPow) sendToIngest(body []byte, topic string, metadata uploadMetadata, identifier string) {
	pow := Pow{}
	if !u.getPow(&pow) {
		return
	}
	solution := solvePow(pow)
	u.uploadWithPow(pow, solution, body, topic, metadata.serverID, identifier)
}

func (u *httpUploaderPow) close() {
	u.cancel()
	u.transport.CloseIdleConnections()
}
