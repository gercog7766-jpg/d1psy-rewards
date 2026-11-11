package main

import (
	"encoding/json"
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
	for _, change := range []func(*Snapshot){func(s *Snapshot) { s.Provider.AppID = 570 }, func(s *Snapshot) { s.Player.SteamID = "spectator" }, func(s *Snapshot) { s.Player.Activity = "menu" }, func(s *Snapshot) { s.Map.Phase = "warmup" }, func(s *Snapshot) { s.Player.Team = "" }, func(s *Snapshot) { s.Player.State.Kills = -1 }} {
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

func TestRoundKillsNeverMatchTotals(t *testing.T) {
	s := sample()
	if err := json.Unmarshal([]byte(`{"player":{"state":{"round_kills":2},"match_stats":{"kills":37}}}`), &s); err != nil {
		t.Fatal(err)
	}
	if s.wire(1)["kills"] != 2 {
		t.Fatal("sent match totals instead of round kills")
	}
	if !strings.Contains(cfg("x"), `"player_state" "1"`) {
		t.Fatal("round state not requested")
	}
}

func TestSpectatorCannotSupplyKillsButOwnerCanWinAfterDeath(t *testing.T) {
	owner := sample()
	owner.Map.Mode = "competitive"
	owner.Map.Round = 5
	owner.Player.State.Kills = 2
	observed := owner
	observed.Player.SteamID = "76561198000000002"
	observed.Player.State.Kills = 9
	if ownRound(observed, &owner).valid() {
		t.Fatal("spectator kills accepted")
	}
	observed.Round.Phase = "over"
	observed.Round.WinTeam = "CT"
	result := ownRound(observed, &owner)
	if !result.valid() || result.Player.State.Kills != 2 || result.Player.Team != owner.Player.Team {
		t.Fatal("lost own identity or used spectator kills")
	}
	observed.Map.Round++
	if ownRound(observed, &owner).valid() {
		t.Fatal("cached owner crossed rounds")
	}
}
