"""Package the supplied transparent character for the canvas; preserve its artwork."""
from pathlib import Path
from PIL import Image
import base64,io,sys
im=Image.open(sys.argv[1]).convert('RGBA')
a=im.getchannel('A');box=a.point(lambda v:255 if v>16 else 0).getbbox()
x0,y0,x1,y1=box;box=(max(0,x0-8),max(0,y0-8),min(im.width,x1+8),min(im.height,y1+8))
im=im.crop(box);im.thumbnail((384,384),Image.Resampling.LANCZOS)
b=io.BytesIO();im.save(b,format='WEBP',quality=90,method=6)
Path('src/night-run-character.ts').write_text('// User-supplied character, optimized for canvas display.\nexport const nightRunCharacter='+repr(base64.b64encode(b.getvalue()).decode())+';\n')
print(im.size,len(b.getvalue()))
