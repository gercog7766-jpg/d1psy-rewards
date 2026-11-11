from pathlib import Path
import gzip,hashlib,json
root=Path(__file__).resolve().parents[2]/'public'/'downloads'
p=root/'DropsoConnect.exe'
b=p.read_bytes()
if b[:2]!=b'MZ': raise ValueError('Expected Windows PE executable')
(root/'DropsoConnect.exe.gz').write_bytes(gzip.compress(b,compresslevel=9,mtime=0))
(root/'DropsoConnect.json').write_text(json.dumps({'version':'2.0.2','platform':'Windows x64','file':'DropsoConnect.exe','sha256':hashlib.sha256(b).hexdigest(),'size':len(b)},indent=2)+'\n')
print('Windows package:',len(b),'bytes; SHA-256',hashlib.sha256(b).hexdigest())
