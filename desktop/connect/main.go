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
const version = "1.0.1"

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

func remote(path, token string, body any) (map[string]any, error) {
	b, _ := json.Marshal(body)
	req, e := http.NewRequest("POST", site+path, bytes.NewReader(b))
	if e != nil {
		return nil, e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r, e := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if e != nil {
		return nil, fmt.Errorf("Нет связи с Dropso")
	}
	defer r.Body.Close()
	var data map[string]any
	json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&data)
	if r.StatusCode != 200 {
		return nil, fmt.Errorf("Dropso: %v (%d)", data["error"], r.StatusCode)
	}
	return data, nil
}
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
		openBrowser("http://127.0.0.1:28743/")
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
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'")
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("key") != c.local {
			http.Error(w, "Откройте панель через значок Dropso Connect в трее.", 403)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, strings.ReplaceAll(panel, "LOCAL_KEY", c.local))
	})
	mux.HandleFunc("/action", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("X-Dropso-Key") != c.local || r.Header.Get("Origin") != "http://127.0.0.1:28743" {
			http.Error(w, "forbidden", 403)
			return
		}
		var b struct {
			Action, Token, Path string
			Enabled             bool
		}
		if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&b) != nil {
			http.Error(w, "invalid", 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		var err error
		switch b.Action {
		case "connect":
			c.disconnect()
			var d map[string]any
			d, err = remote("/api/connect/start", strings.TrimSpace(b.Token), map[string]any{"version": version})
			if err == nil {
				c.mu.Lock()
				c.token = strings.TrimSpace(b.Token)
				c.session, _ = d["session"].(string)
				c.seq = 0
				c.active = true
				c.status = "Подключено. Ожидаем CS2 (запустите игру после настройки)."
				c.mu.Unlock()
			}
		case "disconnect":
			c.disconnect()
		case "install":
			err = install(b.Path, c.local)
		case "autostart":
			err = autostart(b.Enabled)
		case "status":
		default:
			http.Error(w, "invalid", 400)
			return
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		if err != nil {
			json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"status": c.status, "active": c.active, "last": c.last, "path": detect(), "version": version})
	})
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 40 * time.Second, MaxHeaderBytes: 8192}
	go server.Serve(listener)
	url := "http://127.0.0.1:28743/?key=" + c.local
	if err := install(detect(), c.local); err != nil {
	}
	if len(os.Args) < 2 || os.Args[1] != "--startup" {
		openBrowser(url)
	}
	runTray(func() { openBrowser(url) }, func() { c.disconnect(); os.Exit(0) })
}

const panel = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropso Connect</title><style>body{background:#0c0816;color:#f5efff;font:16px system-ui;margin:0}main{max-width:780px;margin:50px auto;padding:24px}section{background:#181026;border:1px solid #56347c;border-radius:20px;padding:24px;margin:20px 0}h1{font-size:38px}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #6d4395;background:#211432;color:white;box-sizing:border-box}input[type=text],input[type=password]{width:100%;margin:12px 0}button{background:#8338d0;cursor:pointer;margin:5px}p{line-height:1.6;color:#c9bdd8}#status{color:#e1bfff}label{display:block}a{color:#ddafff}</style><main><h1>Dropso Connect <small>1.0</small></h1><p>Киллы и победы раундов CS2 → дропы зрителям твоего Twitch-чата.</p><section><h2>1. Подготовь Counter-Strike 2</h2><p>Папка игры определяется автоматически. При необходимости укажи её вручную: Steam → CS2 → Управление → Просмотреть локальные файлы.</p><input id="path" type="text" placeholder="C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive"><button id="install">Настроить CS2</button><p>После первой настройки перезапусти CS2. Программа принимает данные только от игры на этом компьютере.</p></section><section><h2>2. Подключись перед стримом</h2><p>Открой <a href="https://dropso.site/admin/connect" target="_blank" rel="noopener">Dropso → Админка → Dropso Connect</a>, создай ключ и вставь сюда. Ключ хранится только в памяти до отключения.</p><input id="token" type="password" autocomplete="off" placeholder="Ключ подключения из админки"><button id="connect">Подключить</button><button id="disconnect">Отключить</button><p id="status" role="status"></p><p id="last"></p></section><section><label><input id="auto" type="checkbox"> Запускать Dropso Connect вместе с Windows</label><p>Автозапуск открывает только программу в трее. Перед каждым стримом подключение включается вручную. Закрытие этой вкладки не останавливает программу; выход — через значок в трее.</p></section><p id="msg" role="alert"></p></main><script>const $=id=>document.getElementById(id);async function call(action,extra={}){const r=await fetch('/action',{method:'POST',headers:{'Content-Type':'application/json','X-Dropso-Key':'LOCAL_KEY'},body:JSON.stringify({Action:action,...extra})});const d=await r.json();if(d.error)throw Error(d.error);$('status').textContent=d.status;$('last').textContent=d.last?'Последние данные CS2: '+d.last:'';if(!$('path').value)$('path').value=d.path||'';return d}function task(f){return async()=>{try{$('msg').textContent='';await f()}catch(e){$('msg').textContent=e.message}}}$('install').onclick=task(async()=>{await call('install',{Path:$('path').value});$('msg').textContent='CS2 настроена. Перезапусти игру.'});$('connect').onclick=task(async()=>{await call('connect',{Token:$('token').value});$('token').value=''});$('disconnect').onclick=task(()=>call('disconnect'));$('auto').onchange=task(()=>call('autostart',{Enabled:$('auto').checked}));task(()=>call('status'))();setInterval(task(()=>call('status')),5000)</script></html>`
