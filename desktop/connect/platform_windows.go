//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
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
func autostartEnabled() bool {
	key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	return exec.Command("reg", "query", key, "/v", "DropsoConnect").Run() == nil
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
var uxtheme = syscall.NewLazyDLL("uxtheme.dll")
var gdi32 = syscall.NewLazyDLL("gdi32.dll")

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

var mainWindow uintptr
var controls = map[int]uintptr{}
var rowIDs = [6]string{"kill1", "kill2", "kill3", "kill4", "ace", "win"}
var rowLabels = [6]string{"1+ убийство за раунд", "2+ убийства за раунд", "3+ убийства за раунд", "4+ убийства за раунд", "Эйс · 5 убийств", "Победа в раунде"}
const (
 idPath = 100
 idInstall = 101
 idToken = 102
 idLoad = 103
 idSave = 104
 idConnect = 105
 idDisconnect = 106
 idAuto = 107
 idCopyObs = 108
 idStatus = 109
 idLast = 110
 idLookback = 111
 idEventBase = 200
 idTypeBase = 210
 idCoinMinBase = 220
 idCoinMaxBase = 230
 idSkinMinBase = 240
 idSkinMaxBase = 250
)
var kernel32=syscall.NewLazyDLL("kernel32.dll")
var appCallback uintptr
var windowClass *uint16
var trayHwnd uintptr
var fontRegular, fontBold, brushBackground, brushSurface, brushInput, brushAccent, brushSecondary uintptr
var taskBusy bool
var taskResults = make(chan taskResult, 1)
var scrollX, scrollY int
const virtualWidth, virtualHeight = 1180, 975

type taskResult struct { id int; success string; config *ConnectConfig; err error }

const wmTaskDone = 0x8002
const wmRefreshStatus = 0x8003

func wide(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }
func color(r, g, b byte) uintptr { return uintptr(uint32(r) | uint32(g)<<8 | uint32(b)<<16) }
func makeBrush(rgb uintptr) uintptr { h, _, _ := gdi32.NewProc("CreateSolidBrush").Call(rgb); return h }
func createFont(weight, height int32) uintptr {
	h, _, _ := gdi32.NewProc("CreateFontW").Call(uintptr(height), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(wide("Segoe UI"))))
	return h
}
func control(parent uintptr, id int, class, text string, style uint32, x, y, w, h int) uintptr {
	hw, _, _ := user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(wide(class))), uintptr(unsafe.Pointer(wide(text))), uintptr(style|0x50000000), uintptr(x), uintptr(y), uintptr(w), uintptr(h), parent, uintptr(id), 0, 0)
	controls[id] = hw
	if font := fontRegular; font != 0 { user32.NewProc("SendMessageW").Call(hw, 0x0030, font, 1) }
	if class == "BUTTON" || class == "COMBOBOX" || class == "EDIT" { uxtheme.NewProc("SetWindowTheme").Call(hw, uintptr(unsafe.Pointer(wide(""))), uintptr(unsafe.Pointer(wide("")))) }
	return hw
}
func textControl(parent uintptr, id int, text string, x, y, w, h int, bold bool) {
	hwndControl := control(parent, id, "STATIC", text, 0, x, y, w, h)
	font := fontRegular
	if bold { font = fontBold }
	if font != 0 { user32.NewProc("SendMessageW").Call(hwndControl, 0x0030, font, 1) }
}
func setText(id int, s string) { if h := controls[id]; h != 0 { user32.NewProc("SetWindowTextW").Call(h, uintptr(unsafe.Pointer(wide(s)))) } }
func getText(id int) string {
	h := controls[id]; if h == 0 { return "" }
	n, _, _ := user32.NewProc("GetWindowTextLengthW").Call(h)
	buf := make([]uint16, n+1)
	user32.NewProc("GetWindowTextW").Call(h, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return syscall.UTF16ToString(buf)
}
func checked(id int) bool { v, _, _ := user32.NewProc("SendMessageW").Call(controls[id], 0x00f0, 0, 0); return v == 1 }
func setChecked(id int, v bool) { n := uintptr(0); if v { n = 1 }; user32.NewProc("SendMessageW").Call(controls[id], 0x00f1, n, 0) }
func comboSet(id int, v string) {
	h := controls[id]; label := "Монеты"; if v == "skin" { label = "Скин из каталога" }
	idx, _, _ := user32.NewProc("SendMessageW").Call(h, 0x014d, ^uintptr(0), uintptr(unsafe.Pointer(wide(label))))
	user32.NewProc("SendMessageW").Call(h, 0x014e, idx, 0)
}
func comboGet(id int) string {
	h := controls[id]; idx, _, _ := user32.NewProc("SendMessageW").Call(h, 0x0147, 0, 0)
	if int32(idx) < 0 { return "coins" }
	buf := make([]uint16, 64); user32.NewProc("SendMessageW").Call(h, 0x0148, idx, uintptr(unsafe.Pointer(&buf[0])))
	if syscall.UTF16ToString(buf) == "Скин из каталога" { return "skin" }
	return "coins"
}
func showWindow(){if mainWindow!=0{user32.NewProc("ShowWindow").Call(mainWindow,5);user32.NewProc("SetForegroundWindow").Call(mainWindow)}}
func nativeStatus(s string){setText(idStatus,s)}
func setCue(id int, text string) { if h := controls[id]; h != 0 { user32.NewProc("SendMessageW").Call(h, 0x1501, 1, uintptr(unsafe.Pointer(wide(text)))) } }
func button(parent uintptr, id int, label string, primary bool, x, y, w, h int) uintptr {
	style := uint32(0x00008000)
	if primary { style |= 0x00000001 }
	return control(parent, id, "BUTTON", label, style, x, y, w, h)
}
func createMainControls(hwnd uintptr) {
	textControl(hwnd, 1, "Dropso Connect", 24, 18, 430, 38, true)
	textControl(hwnd, 2, "Управление CS2-дропами · настройки сохраняются в твоём аккаунте Dropso", 25, 55, 880, 24, false)
	textControl(hwnd, 3, "COUNTER-STRIKE 2", 24, 103, 300, 22, true)
	textControl(hwnd, 4, "Папка игры", 24, 131, 150, 20, false)
	control(hwnd, idPath, "EDIT", detect(), 0x00800000|0x00000080, 24, 154, 830, 36)
	button(hwnd, idInstall, "Сохранить путь и настроить CS2", true, 875, 154, 265, 36)

	textControl(hwnd, 5, "ПОДКЛЮЧЕНИЕ DROPso", 24, 216, 300, 22, true)
	textControl(hwnd, 6, "Ключ подключения", 24, 244, 230, 20, false)
	control(hwnd, idToken, "EDIT", "", 0x00800000|0x00000080|0x00000020, 24, 267, 830, 38)
	button(hwnd, idLoad, "Загрузить настройки", false, 875, 267, 265, 38)
	setCue(idToken, "Вставь сюда ключ, созданный в Админка → Dropso Connect")
	textControl(hwnd, 7, "Ключ действует 24 часа. Его нужно создать в админке и вставить сюда перед подключением.", 24, 311, 920, 20, false)

	textControl(hwnd, 8, "СОБЫТИЯ И НАГРАДЫ", 24, 355, 360, 24, true)
	textControl(hwnd, 9, "Для каждого события отдельно выбери награду и диапазон.", 24, 382, 760, 20, false)
	textControl(hwnd, 10, "СОБЫТИЕ", 24, 419, 230, 22, true)
	textControl(hwnd, 11, "НАГРАДА", 270, 419, 190, 22, true)
	textControl(hwnd, 12, "МОНЕТЫ ОТ", 480, 419, 100, 22, true)
	textControl(hwnd, 13, "МОНЕТЫ ДО", 590, 419, 100, 22, true)
	textControl(hwnd, 14, "СКИН ОТ", 700, 419, 100, 22, true)
	textControl(hwnd, 15, "СКИН ДО", 810, 419, 100, 22, true)
	for i, label := range rowLabels {
		y := 448 + i*46
		control(hwnd, idEventBase+i, "BUTTON", label, 0x00000003|0x00010000, 24, y, 230, 34)
		h := control(hwnd, idTypeBase+i, "COMBOBOX", "", 0x00000003|0x00200000, 270, y, 190, 240)
		user32.NewProc("SendMessageW").Call(h, 0x0143, 0, uintptr(unsafe.Pointer(wide("Монеты"))))
		user32.NewProc("SendMessageW").Call(h, 0x0143, 0, uintptr(unsafe.Pointer(wide("Скин из каталога"))))
		comboSet(idTypeBase+i, "coins")
		control(hwnd, idCoinMinBase+i, "EDIT", "5", 0x00800000|0x00000080|0x00002000, 480, y, 95, 34)
		control(hwnd, idCoinMaxBase+i, "EDIT", "5", 0x00800000|0x00000080|0x00002000, 590, y, 95, 34)
		control(hwnd, idSkinMinBase+i, "EDIT", "2", 0x00800000|0x00000080|0x00002000, 700, y, 95, 34)
		control(hwnd, idSkinMaxBase+i, "EDIT", "20", 0x00800000|0x00000080|0x00002000, 810, y, 95, 34)
	}

	textControl(hwnd, 16, "Активность чата, секунд", 24, 737, 220, 20, false)
	control(hwnd, idLookback, "EDIT", "300", 0x00800000|0x00000080|0x00002000, 24, 760, 130, 34)
	button(hwnd, idSave, "Сохранить события", false, 180, 760, 205, 38)
	button(hwnd, idConnect, "Подключить перед стримом", true, 405, 760, 255, 38)
	button(hwnd, idDisconnect, "Отключить", false, 680, 760, 150, 38)
	control(hwnd, idAuto, "BUTTON", "Запускать Dropso Connect вместе с Windows", 0x00000003|0x00010000, 24, 814, 400, 30)
	setChecked(idAuto, autostartEnabled())
	textControl(hwnd, 17, "OBS  ·  dropso.site/obs/connect", 24, 862, 600, 24, true)
	button(hwnd, idCopyObs, "Копировать ссылку OBS", false, 875, 856, 265, 38)
	initialStatus := "Отключено · вставь ключ подключения, затем нажми «Загрузить настройки»."
	if startupError != "" { initialStatus = startupError }
	control(hwnd, idStatus, "STATIC", initialStatus, 0, 24, 906, 1116, 34)
	control(hwnd, idLast, "STATIC", "", 0, 24, 941, 1116, 24)
}
func configFromControls()ConnectConfig{events:=map[string]EventRule{};enabled:=false;for i,key:=range rowIDs{a,_:=strconv.Atoi(getText(idCoinMinBase+i));b,_:=strconv.Atoi(getText(idCoinMaxBase+i));lo,_:=strconv.Atoi(getText(idSkinMinBase+i));hi,_:=strconv.Atoi(getText(idSkinMaxBase+i));on:=checked(idEventBase+i);enabled=enabled||on;events[key]=EventRule{Enabled:on,Type:comboGet(idTypeBase+i),CoinMin:a,CoinMax:b,Min:lo,Max:hi}};look,_:=strconv.Atoi(getText(idLookback));return ConnectConfig{Enabled:enabled,Events:events,Modes:[]string{"competitive","scrimcomp2v2","casual","deathmatch","gungameprogressive"},Cooldown:0,Lookback:look,MinViewers:1,MaxAwards:1000,Budget:1000000,TradeRequired:false,ExcludePrevious:false}}
func applyConfig(cfg ConnectConfig){for i,key:=range rowIDs{r:=cfg.Events[key];setChecked(idEventBase+i,r.Enabled);comboSet(idTypeBase+i,r.Type);setText(idCoinMinBase+i,strconv.Itoa(r.CoinMin));setText(idCoinMaxBase+i,strconv.Itoa(r.CoinMax));setText(idSkinMinBase+i,strconv.Itoa(r.Min));setText(idSkinMaxBase+i,strconv.Itoa(r.Max))};setText(idLookback,strconv.Itoa(cfg.Lookback))}
func copyText(s string){opened,_,_:=user32.NewProc("OpenClipboard").Call(mainWindow);if opened==0{return};defer user32.NewProc("CloseClipboard").Call();user32.NewProc("EmptyClipboard").Call();data:=append(syscall.StringToUTF16(s),0);mem,_,_:=kernel32.NewProc("GlobalAlloc").Call(0x0002,uintptr(len(data)*2));ptr,_,_:=kernel32.NewProc("GlobalLock").Call(mem);if ptr==0{return};copy((*[1<<20]uint16)(unsafe.Pointer(ptr))[:len(data)],data);kernel32.NewProc("GlobalUnlock").Call(mem);user32.NewProc("SetClipboardData").Call(13,mem)}
func runTask(id int, success string, fn func() (*ConnectConfig, error)) {
	if taskBusy { return }
	taskBusy = true
	for _, buttonID := range []int{idInstall, idLoad, idSave, idConnect, idAuto} { user32.NewProc("EnableWindow").Call(controls[buttonID], 0) }
	setAppStatus("Выполняю запрос… окно остаётся доступным.")
	go func() { cfg, err := fn(); taskResults <- taskResult{id: id, success: success, config: cfg, err: err}; user32.NewProc("PostMessageW").Call(mainWindow, wmTaskDone, 0, 0) }()
}
func handleCommand(id int) {
	token := strings.TrimSpace(getText(idToken))
	switch id {
	case idInstall:
		path := getText(idPath)
		runTask(id, "CS2 настроена. Если игра запущена — перезапусти её.", func() (*ConnectConfig, error) { return nil, installGame(path) })
	case idLoad:
		runTask(id, "Настройки загружены из Dropso.", func() (*ConnectConfig, error) { cfg, err := loadConnectConfig(token); return &cfg, err })
	case idSave:
		cfg := configFromControls()
		runTask(id, "События сохранены.", func() (*ConnectConfig, error) { return nil, saveConnectConfig(token, cfg) })
	case idConnect:
		runTask(id, "Подключено. Можно запускать CS2.", func() (*ConnectConfig, error) { return nil, connectWithKey(token) })
	case idDisconnect:
		disconnectClient(); nativeStatus("Подключение остановлено.")
	case idAuto:
		enabled := checked(idAuto)
		runTask(id, "Настройка автозапуска сохранена.", func() (*ConnectConfig, error) { return nil, autostart(enabled) })
	case idCopyObs:
		copyText("https://dropso.site/obs/connect"); nativeStatus("Ссылка OBS скопирована.")
	}
}
func refreshStatus() {
	c.mu.Lock(); status, last := c.status, c.last; c.mu.Unlock()
	if status != "" && !taskBusy { nativeStatus(status) }
	if last != "" { setText(idLast, "Последние данные CS2: "+last) }
}
func setControlColors(hdc, hwnd uintptr, which uint32) uintptr {
	if which == 0x0133 { // edit controls
		gdi32.NewProc("SetTextColor").Call(hdc, color(246, 241, 252))
		gdi32.NewProc("SetBkColor").Call(hdc, color(35, 26, 49))
		return brushInput
	}
	if which == 0x0135 { // buttons and checkboxes
		gdi32.NewProc("SetTextColor").Call(hdc, color(246, 241, 252))
		controlID, _, _ := user32.NewProc("GetDlgCtrlID").Call(hwnd)
		if int(controlID) == idConnect || int(controlID) == idInstall { gdi32.NewProc("SetBkColor").Call(hdc, color(132, 55, 216)); return brushAccent }
		gdi32.NewProc("SetBkColor").Call(hdc, color(35, 26, 49)); return brushSecondary
	}
	if which == 0x0134 { // dropdown list
		gdi32.NewProc("SetTextColor").Call(hdc, color(246, 241, 252))
		gdi32.NewProc("SetBkColor").Call(hdc, color(35, 26, 49))
		return brushInput
	}
	gdi32.NewProc("SetTextColor").Call(hdc, color(235, 226, 246))
	gdi32.NewProc("SetBkMode").Call(hdc, 1)
	return brushBackground
}
func finishTask() {
	result := <-taskResults
	taskBusy = false
	for _, buttonID := range []int{idInstall, idLoad, idSave, idConnect, idAuto} { user32.NewProc("EnableWindow").Call(controls[buttonID], 1) }
	if result.err != nil { setAppStatus(result.err.Error()); return }
	if result.config != nil { applyConfig(*result.config) }
	setAppStatus(result.success)
}
func setAppStatus(s string) { c.mu.Lock(); c.status = s; c.mu.Unlock(); nativeStatus(s) }
func updateScrollRanges(hwnd uintptr) {
	var rect struct{ Left, Top, Right, Bottom int32 }
	user32.NewProc("GetClientRect").Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	maxX, maxY := virtualWidth-int(rect.Right), virtualHeight-int(rect.Bottom)
	if maxX < 0 { maxX = 0 }; if maxY < 0 { maxY = 0 }
	if scrollX > maxX { scrollX = maxX }; if scrollY > maxY { scrollY = maxY }
	user32.NewProc("SetScrollRange").Call(hwnd, 0, 0, uintptr(maxX), 1)
	user32.NewProc("SetScrollRange").Call(hwnd, 1, 0, uintptr(maxY), 1)
	user32.NewProc("SetScrollPos").Call(hwnd, 0, uintptr(scrollX), 1)
	user32.NewProc("SetScrollPos").Call(hwnd, 1, uintptr(scrollY), 1)
}
func scrollWindow(hwnd uintptr, horizontal, vertical int) {
	newX, newY := scrollX+horizontal, scrollY+vertical
	var rect struct{ Left, Top, Right, Bottom int32 }
	user32.NewProc("GetClientRect").Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	maxX, maxY := virtualWidth-int(rect.Right), virtualHeight-int(rect.Bottom)
	if maxX < 0 { maxX = 0 }; if maxY < 0 { maxY = 0 }
	if newX < 0 { newX = 0 }; if newY < 0 { newY = 0 }
	if newX > maxX { newX = maxX }; if newY > maxY { newY = maxY }
	dx, dy := newX-scrollX, newY-scrollY
	if dx == 0 && dy == 0 { return }
	scrollX, scrollY = newX, newY
	user32.NewProc("ScrollWindowEx").Call(hwnd, uintptr(-dx), uintptr(-dy), 0, 0, 0, 0, 0, 0x0007)
	user32.NewProc("SetScrollPos").Call(hwnd, 0, uintptr(scrollX), 1)
	user32.NewProc("SetScrollPos").Call(hwnd, 1, uintptr(scrollY), 1)
}
func windowProcedure(hwnd uintptr, m uint32, wp, lp uintptr) uintptr {
	switch m {
	case 0x0001:
		mainWindow = hwnd
		createMainControls(hwnd)
		user32.NewProc("SetTimer").Call(hwnd, 1, 1000, 0)
		if len(os.Args) > 1 && os.Args[1] == "--startup" { user32.NewProc("ShowWindow").Call(hwnd, 0) } else { user32.NewProc("ShowWindow").Call(hwnd, 5) }
		return 0
	case 0x0111:
		id := int(wp & 0xffff)
		if id >= idInstall && id <= idCopyObs { handleCommand(id) }
		return 0
	case 0x0005:
		updateScrollRanges(hwnd); return 0
	case 0x0114, 0x0115:
		request := int(wp & 0xffff)
		thumb := int((wp >> 16) & 0xffff)
		if m == 0x0115 {
			switch request { case 0: scrollWindow(hwnd, 0, -40); case 1: scrollWindow(hwnd, 0, 40); case 2: scrollWindow(hwnd, 0, -300); case 3: scrollWindow(hwnd, 0, 300); case 4, 5: scrollWindow(hwnd, 0, thumb-scrollY); case 6: scrollWindow(hwnd, 0, -scrollY); case 7: scrollWindow(hwnd, 0, virtualHeight-scrollY) }
		} else {
			switch request { case 0: scrollWindow(hwnd, -50, 0); case 1: scrollWindow(hwnd, 50, 0); case 2: scrollWindow(hwnd, -300, 0); case 3: scrollWindow(hwnd, 300, 0); case 4, 5: scrollWindow(hwnd, thumb-scrollX, 0); case 6: scrollWindow(hwnd, -scrollX, 0); case 7: scrollWindow(hwnd, virtualWidth-scrollX, 0) }
		}
		return 0
	case 0x020a:
		delta := int(int16(uint16((wp >> 16) & 0xffff)))
		if delta > 0 { scrollWindow(hwnd, 0, -120) } else if delta < 0 { scrollWindow(hwnd, 0, 120) }
		return 0
	case 0x0133, 0x0134, 0x0135, 0x0138:
		return setControlColors(wp, lp, m)
	case wmTaskDone:
		finishTask(); return 0
	case wmRefreshStatus, 0x0113:
		refreshStatus(); return 0
	case 0x0010:
		user32.NewProc("ShowWindow").Call(hwnd, 0); return 0
	case 0x0002:
		user32.NewProc("KillTimer").Call(hwnd, 1)
		user32.NewProc("PostQuitMessage").Call(0); return 0
	}
	r, _, _ := user32.NewProc("DefWindowProcW").Call(hwnd, uintptr(m), wp, lp)
	return r
}
func runTray(open, exit func()) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	fontRegular = createFont(400, -18)
	fontBold = createFont(700, -19)
	brushBackground = makeBrush(color(14, 10, 22))
	brushSurface = makeBrush(color(25, 18, 36))
	brushInput = makeBrush(color(35, 26, 49))
	brushAccent = makeBrush(color(132, 55, 216))
	brushSecondary = makeBrush(color(48, 36, 63))
	windowClass = wide("DropsoConnectMainWindow")
	appCallback = syscall.NewCallback(windowProcedure)
	var cl wc
	cl.Size = uint32(unsafe.Sizeof(cl))
	cl.Proc = appCallback
	cl.Name = windowClass
	cl.Brush = brushBackground
	user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&cl)))
	width, height := 1220, 1000
	screenW, _, _ := user32.NewProc("GetSystemMetrics").Call(0)
	screenH, _, _ := user32.NewProc("GetSystemMetrics").Call(1)
	if int(screenW) < width+60 { width = int(screenW)-60 }
	if int(screenH) < height+100 { height = int(screenH)-100 }
	if width < 800 { width = 800 }; if height < 620 { height = 620 }
	hwnd, _, _ := user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(windowClass)), uintptr(unsafe.Pointer(wide("Dropso Connect 2.0.2"))), 0x00ff0000, 30, 30, uintptr(width), uintptr(height), 0, 0, 0, 0)
	mainWindow = hwnd

	name := wide("DropsoConnectTray")
	proc := syscall.NewCallback(func(w uintptr, m uint32, wp, lp uintptr) uintptr {
		if m == 0x8001 {
			if lp == 0x202 || lp == 0x203 { open() }
			if lp == 0x205 {
				menu, _, _ := user32.NewProc("CreatePopupMenu").Call()
				for _, x := range []struct { id uintptr; label string }{{1, "Открыть Dropso Connect"}, {2, "Отключить"}, {3, "Выход"}} {
					t := wide(x.label); user32.NewProc("AppendMenuW").Call(menu, 0, x.id, uintptr(unsafe.Pointer(t)))
				}
				var p point
				user32.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&p)))
				user32.NewProc("SetForegroundWindow").Call(w)
				id, _, _ := user32.NewProc("TrackPopupMenu").Call(menu, 0x100, uintptr(p.X), uintptr(p.Y), 0, w, 0)
				user32.NewProc("DestroyMenu").Call(menu)
				switch id { case 1: open(); case 2: disconnectClient(); nativeStatus("Подключение остановлено."); case 3: exit() }
			}
			return 0
		}
		r, _, _ := user32.NewProc("DefWindowProcW").Call(w, uintptr(m), wp, lp)
		return r
	})
	var trayClass wc
	trayClass.Size = uint32(unsafe.Sizeof(trayClass))
	trayClass.Proc = proc
	trayClass.Name = name
	user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&trayClass)))
	trayHwnd, _, _ = user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)), 0, 0, 0, 0, 0, 0, 0, 0, 0)
	icon, _, _ := user32.NewProc("LoadIconW").Call(0, 32516)
	n := notify{Wnd: trayHwnd, ID: 1, Flags: 7, Callback: 0x8001, Icon: icon}
	n.Size = uint32(unsafe.Sizeof(n))
	copy(n.Tip[:], syscall.StringToUTF16("Dropso Connect 2.0.2 · CS2"))
	shell32.NewProc("Shell_NotifyIconW").Call(0, uintptr(unsafe.Pointer(&n)))
	defer shell32.NewProc("Shell_NotifyIconW").Call(2, uintptr(unsafe.Pointer(&n)))
	if len(os.Args) > 1 && os.Args[1] == "--startup" { user32.NewProc("ShowWindow").Call(mainWindow, 0) }
	var m msg
	for {
		r, _, _ := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 { break }
		user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&m)))
		user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&m)))
	}
}
