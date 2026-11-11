//go:build !windows

package main

func openBrowser(string)     {}
func steamRoots() []string   { return nil }
func autostart(bool) error   { return nil }
func autostartEnabled() bool { return false }
func runTray(func(), func()) { select {} }
func showWindow()            {}
