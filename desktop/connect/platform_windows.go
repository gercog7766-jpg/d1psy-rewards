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
var controls=map[int]uintptr{}
var rowIDs=[6]string{"kill1","kill2","kill3","kill4","ace","win"}
var rowLabels=[6]string{"1+ убийство за раунд","2+ убийства за раунд","3+ убийства за раунд","4+ убийства за раунд","Эйс (5 убийств)","Победа в раунде"}
const (
 idPath=100; idInstall=101; idToken=102; idLoad=103; idSave=104; idConnect=105; idDisconnect=106; idAuto=107; idCopyObs=108; idStatus=109; idLast=110; idLookback=111
 idEventBase=200; idTypeBase=210; idCoinMinBase=220; idCoinMaxBase=230; idSkinMinBase=240; idSkinMaxBase=250
)
var kernel32=syscall.NewLazyDLL("kernel32.dll")
var appCallback uintptr
var windowClass *uint16
var trayHwnd uintptr
func wide(s string)*uint16{p,_:=syscall.UTF16PtrFromString(s);return p}
func control(parent uintptr,id int,class,text string,style uint32,x,y,w,h int)uintptr{hw,_,_:=user32.NewProc("CreateWindowExW").Call(0,uintptr(unsafe.Pointer(wide(class))),uintptr(unsafe.Pointer(wide(text))),uintptr(style|0x50000000),uintptr(x),uintptr(y),uintptr(w),uintptr(h),parent,uintptr(id),0,0);controls[id]=hw;return hw}
func textControl(parent uintptr,text string,x,y,w,h int){control(parent,0,"STATIC",text,0,x,y,w,h)}
func setText(id int,s string){if h:=controls[id];h!=0{user32.NewProc("SetWindowTextW").Call(h,uintptr(unsafe.Pointer(wide(s))))}}
func getText(id int)string{h:=controls[id];if h==0{return ""};n,_,_:=user32.NewProc("GetWindowTextLengthW").Call(h);buf:=make([]uint16,n+1);user32.NewProc("GetWindowTextW").Call(h,uintptr(unsafe.Pointer(&buf[0])),uintptr(len(buf)));return syscall.UTF16ToString(buf)}
func checked(id int)bool{v,_,_:=user32.NewProc("SendMessageW").Call(controls[id],0x00f0,0,0);return v==1}
func setChecked(id int,v bool){n:=uintptr(0);if v{n=1};user32.NewProc("SendMessageW").Call(controls[id],0x00f1,n,0)}
func comboSet(id int,v string){h:=controls[id];idx:=uintptr(0);label:="Монеты";if v=="skin"{label="Скин из каталога"};idx,_,_=user32.NewProc("SendMessageW").Call(h,0x014d,^uintptr(0),uintptr(unsafe.Pointer(wide(label))));user32.NewProc("SendMessageW").Call(h,0x014e,idx,0)}
func comboGet(id int)string{h:=controls[id];idx,_,_:=user32.NewProc("SendMessageW").Call(h,0x0147,0,0);if int32(idx)<0{return "coins"};buf:=make([]uint16,64);user32.NewProc("SendMessageW").Call(h,0x0148,idx,uintptr(unsafe.Pointer(&buf[0])));if syscall.UTF16ToString(buf)=="Скин из каталога"{return "skin"};return "coins"}
func showWindow(){if mainWindow!=0{user32.NewProc("ShowWindow").Call(mainWindow,5);user32.NewProc("SetForegroundWindow").Call(mainWindow)}}
func nativeStatus(s string){setText(idStatus,s)}
func createMainControls(hwnd uintptr){
 textControl(hwnd,"Dropso Connect 2.0 · настройки и подключение CS2",20,18,950,32)
 textControl(hwnd,"Папка Counter-Strike 2",20,57,300,20);control(hwnd,idPath,"EDIT",detect(),0x00001000|0x00000080,20,78,790,28);control(hwnd,idInstall,"BUTTON","Настроить CS2",0,825,78,180,28)
 textControl(hwnd,"Ключ подключения Dropso · вставь сюда один раз",20,116,550,20);control(hwnd,idToken,"EDIT","",0x00000080|0x00000020,20,137,790,28);control(hwnd,idLoad,"BUTTON","Загрузить настройки",0,825,137,180,28)
 textControl(hwnd,"Событие",20,180,180,20);textControl(hwnd,"Награда",225,180,150,20);textControl(hwnd,"Монет от",405,180,90,20);textControl(hwnd,"Монет до",505,180,90,20);textControl(hwnd,"Скин от",605,180,90,20);textControl(hwnd,"Скин до",705,180,90,20)
 for i,label:=range rowLabels{y:=207+i*42;control(hwnd,idEventBase+i,"BUTTON",label,0x00000003|0x00010000,20,y,195,28);h:=control(hwnd,idTypeBase+i,"COMBOBOX","",0x0003|0x0020|0x0200,225,y,165,220);user32.NewProc("SendMessageW").Call(h,0x0143,0,uintptr(unsafe.Pointer(wide("Монеты"))));user32.NewProc("SendMessageW").Call(h,0x0143,0,uintptr(unsafe.Pointer(wide("Скин из каталога"))));comboSet(idTypeBase+i,"coins");control(hwnd,idCoinMinBase+i,"EDIT","5",0x00001000|0x00000080|0x00002000,405,y,90,28);control(hwnd,idCoinMaxBase+i,"EDIT","5",0x00001000|0x00000080|0x00002000,505,y,90,28);control(hwnd,idSkinMinBase+i,"EDIT","2",0x00001000|0x00000080|0x00002000,605,y,90,28);control(hwnd,idSkinMaxBase+i,"EDIT","20",0x00001000|0x00000080|0x00002000,705,y,90,28)}
 textControl(hwnd,"Активность чата, секунд",20,472,220,20);control(hwnd,idLookback,"EDIT","300",0x00001000|0x00000080|0x00002000,20,494,120,28)
 control(hwnd,idSave,"BUTTON","Сохранить события",0,160,494,170,30);control(hwnd,idConnect,"BUTTON","Подключить перед стримом",0,350,494,230,30);control(hwnd,idDisconnect,"BUTTON","Отключить",0,595,494,125,30)
 control(hwnd,idAuto,"BUTTON","Запускать Dropso Connect вместе с Windows",0x00000003|0x00010000,20,545,420,28);setChecked(idAuto,autostartEnabled())
 textControl(hwnd,"OBS виджет: https://dropso.site/obs/connect",20,590,650,25);control(hwnd,idCopyObs,"BUTTON","Копировать ссылку OBS",0,680,586,200,30)
	initialStatus:="Отключено. Вставьте ключ, чтобы загрузить настройки.";if startupError!=""{initialStatus=startupError};control(hwnd,idStatus,"STATIC",initialStatus,0,20,635,980,42);control(hwnd,idLast,"STATIC","",0,20,685,980,24)
}
func configFromControls()ConnectConfig{events:=map[string]EventRule{};enabled:=false;for i,key:=range rowIDs{a,_:=strconv.Atoi(getText(idCoinMinBase+i));b,_:=strconv.Atoi(getText(idCoinMaxBase+i));lo,_:=strconv.Atoi(getText(idSkinMinBase+i));hi,_:=strconv.Atoi(getText(idSkinMaxBase+i));on:=checked(idEventBase+i);enabled=enabled||on;events[key]=EventRule{Enabled:on,Type:comboGet(idTypeBase+i),CoinMin:a,CoinMax:b,Min:lo,Max:hi}};look,_:=strconv.Atoi(getText(idLookback));return ConnectConfig{Enabled:enabled,Events:events,Modes:[]string{"competitive","scrimcomp2v2","casual","deathmatch","gungameprogressive"},Cooldown:0,Lookback:look,MinViewers:1,MaxAwards:1000,Budget:1000000,TradeRequired:false,ExcludePrevious:false}}
func applyConfig(cfg ConnectConfig){for i,key:=range rowIDs{r:=cfg.Events[key];setChecked(idEventBase+i,r.Enabled);comboSet(idTypeBase+i,r.Type);setText(idCoinMinBase+i,strconv.Itoa(r.CoinMin));setText(idCoinMaxBase+i,strconv.Itoa(r.CoinMax));setText(idSkinMinBase+i,strconv.Itoa(r.Min));setText(idSkinMaxBase+i,strconv.Itoa(r.Max))};setText(idLookback,strconv.Itoa(cfg.Lookback))}
func copyText(s string){opened,_,_:=user32.NewProc("OpenClipboard").Call(mainWindow);if opened==0{return};defer user32.NewProc("CloseClipboard").Call();user32.NewProc("EmptyClipboard").Call();data:=append(syscall.StringToUTF16(s),0);mem,_,_:=kernel32.NewProc("GlobalAlloc").Call(0x0002,uintptr(len(data)*2));ptr,_,_:=kernel32.NewProc("GlobalLock").Call(mem);if ptr==0{return};copy((*[1<<20]uint16)(unsafe.Pointer(ptr))[:len(data)],data);kernel32.NewProc("GlobalUnlock").Call(mem);user32.NewProc("SetClipboardData").Call(13,mem)}
func handleCommand(id int){token:=strings.TrimSpace(getText(idToken));switch id{case idInstall:if e:=installGame(getText(idPath));e!=nil{nativeStatus(e.Error())}else{nativeStatus("CS2 настроена. Перезапустите игру, если она уже открыта.")};case idLoad:cfg,e:=loadConnectConfig(token);if e!=nil{nativeStatus(e.Error())}else{applyConfig(cfg);nativeStatus("Настройки загружены из Dropso.")};case idSave:if e:=saveConnectConfig(token,configFromControls());e!=nil{nativeStatus(e.Error())}else{nativeStatus("События сохранены.")};case idConnect:if e:=connectWithKey(token);e!=nil{nativeStatus(e.Error())}else{nativeStatus("Подключено. Можно запускать CS2.")};case idDisconnect:disconnectClient();nativeStatus("Подключение остановлено.");case idAuto:if e:=autostart(checked(idAuto));e!=nil{nativeStatus(e.Error())};case idCopyObs:copyText("https://dropso.site/obs/connect");nativeStatus("Ссылка OBS скопирована.")}}
func windowProcedure(hwnd uintptr,m uint32,wp,lp uintptr)uintptr{switch m{case 0x0001:mainWindow=hwnd;createMainControls(hwnd);if len(os.Args)>1&&os.Args[1]=="--startup"{user32.NewProc("ShowWindow").Call(hwnd,0)}else{user32.NewProc("ShowWindow").Call(hwnd,5)};return 0;case 0x0111:id:=int(wp&0xffff);if id>=idInstall&&id<=idCopyObs{handleCommand(id)};return 0;case 0x0010:user32.NewProc("ShowWindow").Call(hwnd,0);return 0;case 0x0002:user32.NewProc("PostQuitMessage").Call(0);return 0};r,_,_:=user32.NewProc("DefWindowProcW").Call(hwnd,uintptr(m),wp,lp);return r}
func runTray(open,exit func()){runtime.LockOSThread();defer runtime.UnlockOSThread();windowClass=wide("DropsoConnectMainWindow");appCallback=syscall.NewCallback(windowProcedure);var cl wc;cl.Size=uint32(unsafe.Sizeof(cl));cl.Proc=appCallback;cl.Name=windowClass;user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&cl)));hwnd,_,_:=user32.NewProc("CreateWindowExW").Call(0,uintptr(unsafe.Pointer(windowClass)),uintptr(unsafe.Pointer(wide("Dropso Connect 2.0"))),0x00cf0000,100,80,1040,745,0,0,0,0);mainWindow=hwnd
 name:=wide("DropsoConnectTray");proc:=syscall.NewCallback(func(w uintptr,m uint32,wp,lp uintptr)uintptr{if m==0x8001{if lp==0x202||lp==0x203{open()};if lp==0x205{menu,_,_:=user32.NewProc("CreatePopupMenu").Call();for _,x:=range []struct{id uintptr;label string}{{1,"Открыть Dropso Connect"},{2,"Отключить"},{3,"Выход"}}{t:=wide(x.label);user32.NewProc("AppendMenuW").Call(menu,0,x.id,uintptr(unsafe.Pointer(t)))};var p point;user32.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&p)));user32.NewProc("SetForegroundWindow").Call(w);id,_,_:=user32.NewProc("TrackPopupMenu").Call(menu,0x100,uintptr(p.X),uintptr(p.Y),0,w,0);user32.NewProc("DestroyMenu").Call(menu);switch id{case 1:open();case 2:disconnectClient();nativeStatus("Подключение остановлено.");case 3:exit()}};return 0};r,_,_:=user32.NewProc("DefWindowProcW").Call(w,uintptr(m),wp,lp);return r});var trayClass wc;trayClass.Size=uint32(unsafe.Sizeof(trayClass));trayClass.Proc=proc;trayClass.Name=name;user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&trayClass)));trayHwnd,_,_=user32.NewProc("CreateWindowExW").Call(0,uintptr(unsafe.Pointer(name)),uintptr(unsafe.Pointer(name)),0,0,0,0,0,0,0,0,0);icon,_,_:=user32.NewProc("LoadIconW").Call(0,32516);n:=notify{Wnd:trayHwnd,ID:1,Flags:7,Callback:0x8001,Icon:icon};n.Size=uint32(unsafe.Sizeof(n));copy(n.Tip[:],syscall.StringToUTF16("Dropso Connect 2.0 · CS2"));shell32.NewProc("Shell_NotifyIconW").Call(0,uintptr(unsafe.Pointer(&n)));defer shell32.NewProc("Shell_NotifyIconW").Call(2,uintptr(unsafe.Pointer(&n)));if len(os.Args)>1&&os.Args[1]=="--startup"{user32.NewProc("ShowWindow").Call(mainWindow,0)};var m msg;for{r,_,_:=user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&m)),0,0,0);if r==0{break};user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&m)));user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&m)))}}
