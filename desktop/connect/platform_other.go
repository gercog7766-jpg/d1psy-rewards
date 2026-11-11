//go:build !windows

package main

func openBrowser(string)     {}
func steamRoots() []string   { return nil }
func autostart(bool) error   { return nil }
func runTray(func(), func()) { select {} }
