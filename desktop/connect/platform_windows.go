//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"syscall"
	"unsafe"
)

func openBrowser(url string) { exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start() }
func steamRoots() []string {
	roots := []string{filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam"), filepath.Join(os.Getenv("ProgramFiles"), "Steam")}
	b, _ := exec.Command("reg", "query", `HKCU\Software\Valve\Steam`, "/v", "SteamPath").Output()
	m := regexp.MustCompile(`REG_SZ\s+([^\r\n]+)`).FindStringSubmatch(string(b))
	if len(m) > 1 {
		roots = append(roots, m[1])
	}
	return roots
}
func autostart(enabled bool) error {
	key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	if !enabled {
		exec.Command("reg", "delete", key, "/v", "DropsoConnect", "/f").Run()
		return nil
	}
	p, e := os.Executable()
	if e != nil {
		return e
	}
	return exec.Command("reg", "add", key, "/v", "DropsoConnect", "/t", "REG_SZ", "/d", `"`+p+`" --startup`, "/f").Run()
}

var user32 = syscall.NewLazyDLL("user32.dll")
var shell32 = syscall.NewLazyDLL("shell32.dll")

type point struct{ X, Y int32 }
type msg struct {
	Hwnd           uintptr
	Message        uint32
	Wparam, Lparam uintptr
	Time           uint32
	Pt             point
	Private        uint32
}
type wc struct {
	Size, Style                   uint32
	Proc                          uintptr
	ClsExtra, WndExtra            int32
	Instance, Icon, Cursor, Brush uintptr
	Menu, Name                    *uint16
	SmallIcon                     uintptr
}
type notify struct {
	Size                uint32
	Wnd                 uintptr
	ID, Flags, Callback uint32
	Icon                uintptr
	Tip                 [128]uint16
	State, StateMask    uint32
	Info                [256]uint16
	Timeout             uint32
	Title               [64]uint16
	InfoFlags           uint32
	Guid                [16]byte
	Balloon             uintptr
}

func runTray(open, exit func()) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	name, _ := syscall.UTF16PtrFromString("DropsoConnect")
	var hwnd uintptr
	proc := syscall.NewCallback(func(w uintptr, m uint32, wp, lp uintptr) uintptr {
		if m == 0x8001 {
			if lp == 0x202 || lp == 0x203 {
				open()
			}
			if lp == 0x205 {
				menu, _, _ := user32.NewProc("CreatePopupMenu").Call()
				for _, x := range []struct {
					id    uintptr
					label string
				}{{1, "Открыть Dropso Connect"}, {2, "Отключить"}, {3, "Выход"}} {
					t, _ := syscall.UTF16PtrFromString(x.label)
					user32.NewProc("AppendMenuW").Call(menu, 0, x.id, uintptr(unsafe.Pointer(t)))
				}
				var p point
				user32.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&p)))
				user32.NewProc("SetForegroundWindow").Call(w)
				id, _, _ := user32.NewProc("TrackPopupMenu").Call(menu, 0x100, uintptr(p.X), uintptr(p.Y), 0, w, 0)
				user32.NewProc("DestroyMenu").Call(menu)
				switch id {
				case 1:
					open()
				case 2:
					c.disconnect()
				case 3:
					exit()
				}
			}
			return 0
		}
		r, _, _ := user32.NewProc("DefWindowProcW").Call(w, uintptr(m), wp, lp)
		return r
	})
	cl := wc{Proc: proc, Name: name}
	cl.Size = uint32(unsafe.Sizeof(cl))
	user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&cl)))
	hwnd, _, _ = user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)), 0, 0, 0, 0, 0, 0, 0, 0, 0)
	icon, _, _ := user32.NewProc("LoadIconW").Call(0, 32516)
	n := notify{Wnd: hwnd, ID: 1, Flags: 7, Callback: 0x8001, Icon: icon}
	n.Size = uint32(unsafe.Sizeof(n))
	copy(n.Tip[:], syscall.StringToUTF16("Dropso Connect · CS2"))
	shell32.NewProc("Shell_NotifyIconW").Call(0, uintptr(unsafe.Pointer(&n)))
	defer shell32.NewProc("Shell_NotifyIconW").Call(2, uintptr(unsafe.Pointer(&n)))
	var m msg
	for {
		r, _, _ := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 {
			break
		}
		user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&m)))
		user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&m)))
	}
}
