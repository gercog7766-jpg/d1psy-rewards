package main

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const site = "https://dropso.site"
const version = "2.0.0"

type Snapshot struct {
	Provider struct {
		AppID     int    `json:"appid"`
		SteamID   string `json:"steamid"`
		Timestamp int64  `json:"timestamp"`
	} `json:"provider"`
	Map struct {
		Name  string `json:"name"`
		Mode  string `json:"mode"`
		Phase string `json:"phase"`
		Round int    `json:"round"`
	} `json:"map"`
	Round struct {
		Phase   string `json:"phase"`
		WinTeam string `json:"win_team"`
	} `json:"round"`
	Player struct {
		SteamID  string `json:"steamid"`
		Team     string `json:"team"`
		Activity string `json:"activity"`
		State    struct {
			Kills int `json:"round_kills"`
		} `json:"state"`
	} `json:"player"`
	Auth struct {
		Token string `json:"token"`
	} `json:"auth"`
}

func (s Snapshot) valid() bool {
	return s.Provider.AppID == 730 && s.Provider.SteamID != "" && s.Provider.SteamID == s.Player.SteamID && s.Player.Activity == "playing" && s.Map.Phase == "live" && (s.Player.Team == "CT" || s.Player.Team == "T") && s.Map.Name != "" && s.Player.State.Kills >= 0
}
func (s Snapshot) wire(seq int) map[string]any {
	return map[string]any{"seq": seq, "at": s.Provider.Timestamp, "steamId": s.Provider.SteamID, "map": s.Map.Name, "mode": s.Map.Mode, "round": s.Map.Round, "phase": s.Round.Phase, "team": s.Player.Team, "winner": s.Round.WinTeam, "kills": s.Player.State.Kills, "live": s.valid()}
}

type queuedSnapshot struct {
	Snapshot Snapshot
	Session  string
}
type EventRule struct {
	Enabled bool   `json:"enabled"`
	Type    string `json:"type"`
	CoinMin int    `json:"coinMin"`
	CoinMax int    `json:"coinMax"`
	Min     int    `json:"min"`
	Max     int    `json:"max"`
}
type ConnectConfig struct {
	Enabled         bool                 `json:"enabled"`
	Events          map[string]EventRule `json:"events"`
	Modes           []string             `json:"modes"`
	Cooldown        int                  `json:"cooldown"`
	Lookback        int                  `json:"lookback"`
	MinViewers      int                  `json:"minViewers"`
	MaxAwards       int                  `json:"maxAwards"`
	Budget          int                  `json:"budget"`
	TradeRequired   bool                 `json:"tradeRequired"`
	ExcludePrevious bool                 `json:"excludePrevious"`
}
type remoteConfigResponse struct {
	Config  ConnectConfig `json:"config"`
	History []struct {
		Kind       string `json:"kind"`
		Status     string `json:"status"`
		WinnerName string `json:"winner_name"`
		PrizeName  string `json:"prize_name"`
	} `json:"history"`
}
type client struct {
	mu                           sync.Mutex
	token, session, status, last string
	seq                          int
	active                       bool
	own                          *Snapshot
	queue                        chan queuedSnapshot
	local                        string
}

var c = client{status: "Отключено. Подключитесь перед стримом.", queue: make(chan queuedSnapshot, 256)}
var startupError string

func remoteMethod(method,path,token string,body any) (map[string]any, error) {
	var raw io.Reader
	if body!=nil { b,_:=json.Marshal(body);raw=bytes.NewReader(b) }
	req, e := http.NewRequest(method, site+path, raw)
	if e != nil {
		return nil, e
	}
	if body!=nil { req.Header.Set("Content-Type", "application/json") }
	req.Header.Set("Authorization", "Bearer "+token)
	r, e := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if e != nil {
		return nil, fmt.Errorf("Нет связи с Dropso")
	}
	defer r.Body.Close()
	var data map[string]any
	json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&data)
	if r.StatusCode != 200 {
		switch data["error"] {
		case "invalid_key":
			return nil, fmt.Errorf("Ключ не подошёл или истёк. Создай новый в админке и вставь его сюда.")
		case "owner_required":
			return nil, fmt.Errorf("Этот ключ больше не разрешён для аккаунта владельца Dropso.")
		case "invalid_config":
			return nil, fmt.Errorf("Проверь настройки: значение «от» не должно быть больше значения «до».")
		case "connect_unavailable":
			return nil, fmt.Errorf("Dropso временно не отвечает. Попробуй ещё раз через минуту.")
		}
		return nil, fmt.Errorf("Ошибка Dropso (%d). Попробуй ещё раз.", r.StatusCode)
	}
	return data, nil
}
func remote(path, token string, body any) (map[string]any, error) { return remoteMethod("POST",path,token,body) }
func loadConnectConfig(token string)(ConnectConfig,error){d,e:=remoteMethod("GET","/api/connect/config",token,nil);if e!=nil{return ConnectConfig{},e};b,e:=json.Marshal(d);if e!=nil{return ConnectConfig{},e};var out remoteConfigResponse;if e=json.Unmarshal(b,&out);e!=nil{return ConnectConfig{},e};return out.Config,nil}
func saveConnectConfig(token string,cfg ConnectConfig)error{_,e:=remote("/api/connect/config",token,map[string]any{"config":cfg});return e}
func connectWithKey(token string)error{token=strings.TrimSpace(token);if len(token)!=43{return fmt.Errorf("Вставьте ключ подключения из админки Dropso")};c.disconnect();d,e:=remote("/api/connect/start",token,map[string]any{"version":version});if e!=nil{return e};c.mu.Lock();c.token=token;c.session,_=d["session"].(string);c.seq=0;c.active=true;c.status="Подключено. Ожидаем CS2 (запустите игру после настройки).";c.mu.Unlock();return nil}
func disconnectClient(){c.disconnect()}
func installGame(path string)error{return install(path,c.local)}
func (c *client) disconnect() {
	c.mu.Lock()
	token, session := c.token, c.session
	c.active = false
	c.own = nil
	c.token = ""
	c.session = ""
	c.status = "Отключено"
	c.mu.Unlock()
	if session != "" {
		go remote("/api/connect/stop", token, map[string]any{"session": session})
	}
}

// A round win can arrive while the dead owner observes a teammate.
// Reuse only the owner's previously observed team/kills in that exact round.
func ownRound(s Snapshot, previous *Snapshot) Snapshot {
	if s.Provider.SteamID != s.Player.SteamID && previous != nil && previous.valid() &&
		s.Provider.AppID == 730 && s.Provider.SteamID == previous.Provider.SteamID &&
		s.Map.Name == previous.Map.Name && s.Map.Mode == previous.Map.Mode &&
		s.Map.Round == previous.Map.Round && s.Map.Phase == "live" && s.Round.Phase == "over" {
		s.Player = previous.Player
	}
	return s
}
func (c *client) process(job queuedSnapshot) {
	s := job.Snapshot
	c.mu.Lock()
	s = ownRound(s, c.own)
	if c.active && job.Session == c.session && s.valid() {
		copy := s
		c.own = &copy
	}
	if !c.active || job.Session != c.session || s.Provider.SteamID == "" || s.Provider.SteamID != s.Player.SteamID {
		c.mu.Unlock()
		return
	}
	if time.Now().Unix()-s.Provider.Timestamp > 25 || s.Provider.Timestamp-time.Now().Unix() > 25 {
		c.status = "Проверьте часы Windows: данные CS2 устарели"
		c.mu.Unlock()
		return
	}
	c.seq++
	token, session, seq := c.token, c.session, c.seq
	c.mu.Unlock()
	body := s.wire(seq)
	body["session"] = session
	for attempts := 0; attempts < 3; attempts++ {
		c.mu.Lock()
		active := c.active && c.session == session
		c.mu.Unlock()
		if !active {
			return
		}
		_, err := remote("/api/connect/snapshot", token, body)
		c.mu.Lock()
		if c.session != session {
			c.mu.Unlock()
			return
		}
		if err == nil {
			c.status = "Подключено · CS2 передаёт статистику"
			c.last = time.Now().Format("15:04:05")
			c.mu.Unlock()
			return
		}
		c.status = err.Error()
		c.mu.Unlock()
		if time.Now().Unix()-s.Provider.Timestamp > 25 {
			break
		}
	}
	c.mu.Lock()
	if c.session == session {
		c.active = false
		c.session = ""
		c.token = ""
		c.status = "Связь потеряна. Подключитесь вручную перед продолжением."
	}
	c.mu.Unlock()
	go remote("/api/connect/stop", token, map[string]any{"session": session})

}
func secret() string { b := make([]byte, 24); rand.Read(b); return hex.EncodeToString(b) }
func cfg(token string) string {
	return fmt.Sprintf(`"Dropso Connect" { "uri" "http://127.0.0.1:28743/gsi" "timeout" "5.0" "buffer" "0.2" "throttle" "0.5" "heartbeat" "10.0" "auth" { "token" "%s" } "data" { "provider" "1" "map" "1" "round" "1" "player_id" "1" "player_state" "1" } }`, token)
}
func install(path, token string) error {
	path = strings.Trim(strings.TrimSpace(path), `"`)
	if !filepath.IsAbs(path) {
		return fmt.Errorf("Укажите полный путь к папке Counter-Strike Global Offensive")
	}
	target := filepath.Join(path, "game", "csgo", "cfg")
	if st, e := os.Stat(target); e != nil || !st.IsDir() {
		return fmt.Errorf("Не найдена папка game\\csgo\\cfg. Выберите папку Counter-Strike Global Offensive")
	}
	if err := os.WriteFile(filepath.Join(target, "gamestate_integration_dropso.cfg"), []byte(cfg(token)), 0600); err != nil {
		return err
	}
	os.MkdirAll(filepath.Dir(savedPath()), 0700)
	return os.WriteFile(savedPath(), []byte(path), 0600)
}

var libraryPath = regexp.MustCompile(`"path"\s+"([^"]+)"`)

func savedPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "DropsoConnect", "cs2-path.txt")
}
func detect() string {
	if b, e := os.ReadFile(savedPath()); e == nil {
		p := string(b)
		if st, e := os.Stat(filepath.Join(p, "game", "csgo", "cfg")); e == nil && st.IsDir() {
			return p
		}
	}
	roots := steamRoots()
	for _, root := range append([]string{}, roots...) {
		b, _ := os.ReadFile(filepath.Join(root, "steamapps", "libraryfolders.vdf"))
		for _, m := range libraryPath.FindAllStringSubmatch(string(b), -1) {
			roots = append(roots, strings.ReplaceAll(m[1], `\\`, `\`))
		}
	}
	for _, r := range roots {
		p := filepath.Join(r, "steamapps", "common", "Counter-Strike Global Offensive")
		if st, e := os.Stat(filepath.Join(p, "game", "csgo", "cfg")); e == nil && st.IsDir() {
			return p
		}
	}
	return ""
}
func main() {
	c.local = secret()
	listener, e := net.Listen("tcp", "127.0.0.1:28743")
	if e != nil {
		startupError = "Локальный порт CS2 уже занят. Закройте другую копию Dropso Connect и перезапустите программу."
		runTray(func() { showWindow() }, func() { os.Exit(0) })
		return
	}
	go func() {
		for s := range c.queue {
			c.process(s)
		}
	}()
	mux := http.NewServeMux()
	mux.HandleFunc("/gsi", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Origin") != "" {
			http.Error(w, "forbidden", 403)
			return
		}
		var s Snapshot
		if json.NewDecoder(io.LimitReader(r.Body, 65536)).Decode(&s) != nil || subtle.ConstantTimeCompare([]byte(s.Auth.Token), []byte(c.local)) != 1 {
			http.Error(w, "invalid", 403)
			return
		}
		c.mu.Lock()
		session := c.session
		c.mu.Unlock()
		select {
		case c.queue <- queuedSnapshot{s, session}:
			w.WriteHeader(204)
		default:
			http.Error(w, "busy", 503)
		}
	})
	mux.HandleFunc("/", func(w http.ResponseWriter,r *http.Request){w.Header().Set("Cache-Control","no-store");w.Header().Set("X-Frame-Options","DENY");if r.URL.Path!="/"{http.NotFound(w,r);return};http.Error(w,"Настройки доступны в окне Dropso Connect для Windows.",http.StatusForbidden)})
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 40 * time.Second, MaxHeaderBytes: 8192}
	go server.Serve(listener)
	if err := install(detect(), c.local); err != nil {
	}
	runTray(func() { showWindow() }, func() { c.disconnect(); os.Exit(0) })
}
