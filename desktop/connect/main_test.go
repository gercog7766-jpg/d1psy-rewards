package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func sample() Snapshot {
	var s Snapshot
	s.Provider.AppID = 730
	s.Provider.SteamID = "76561198000000001"
	s.Player.SteamID = s.Provider.SteamID
	s.Player.Activity = "playing"
	s.Player.Team = "CT"
	s.Map.Phase = "live"
	s.Map.Name = "de_mirage"
	return s
}
func TestOnlyOwnLiveCS2(t *testing.T) {
	s := sample()
	if !s.valid() {
		t.Fatal("valid player rejected")
	}
	for _, change := range []func(*Snapshot){func(s *Snapshot) { s.Provider.AppID = 570 }, func(s *Snapshot) { s.Player.SteamID = "spectator" }, func(s *Snapshot) { s.Player.Activity = "menu" }, func(s *Snapshot) { s.Map.Phase = "warmup" }, func(s *Snapshot) { s.Player.Team = "" }, func(s *Snapshot) { s.Player.Stats.Kills = -1 }} {
		s = sample()
		change(&s)
		if s.valid() {
			t.Fatal("invalid state accepted")
		}
	}
	s = sample()
	w := s.wire(3)
	if w["seq"] != 3 || w["live"] != true {
		t.Fatal(w)
	}
	if _, ok := w["auth"]; ok {
		t.Fatal("local secret leaked")
	}
}
func TestInstallIsLimitedToGSIConfig(t *testing.T) {
	root := t.TempDir()
	t.Setenv("APPDATA", root)
	t.Setenv("XDG_CONFIG_HOME", root)
	dir := filepath.Join(root, "game", "csgo", "cfg")
	os.MkdirAll(dir, 0700)
	existing := filepath.Join(dir, "autoexec.cfg")
	os.WriteFile(existing, []byte("keep"), 0600)
	if e := install(root, "TOKEN"); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "gamestate_integration_dropso.cfg"))
	if !strings.Contains(string(b), "127.0.0.1:28743/gsi") || !strings.Contains(string(b), "TOKEN") {
		t.Fatal(string(b))
	}
	b, _ = os.ReadFile(existing)
	if string(b) != "keep" {
		t.Fatal("other config changed")
	}
	if install("relative", "x") == nil || install(t.TempDir(), "x") == nil {
		t.Fatal("invalid folder accepted")
	}
}
func TestDisconnectedAndOldSessionJobsAreIgnored(t *testing.T) {
	c := client{active: false, session: "new", seq: 3}
	c.process(queuedSnapshot{sample(), "new"})
	if c.seq != 3 {
		t.Fatal("disconnected delivery")
	}
	c.active = true
	c.process(queuedSnapshot{sample(), "old"})
	if c.seq != 3 {
		t.Fatal("old queued data crossed sessions")
	}
}
