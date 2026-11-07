"""Package the supplied transparent D1PSY mark without redrawing it.
Usage: python scripts/build-brand-icons.py /path/to/supplied-logo.png
"""
import base64, io, json, sys
from pathlib import Path
from PIL import Image
source = Image.open(sys.argv[1]).convert('RGBA')
# Trim transparent padding only; retain all artwork and original proportions.
source = source.crop(source.getbbox())
def png(image):
    out=io.BytesIO();image.save(out,format='PNG',optimize=True)
    return base64.b64encode(out.getvalue()).decode()
def square(size, fraction, background=(0,0,0,0)):
    canvas=Image.new('RGBA',(size,size),background)
    mark=source.copy();mark.thumbnail((round(size*fraction),round(size*fraction)),Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark,((size-mark.width)//2,(size-mark.height)//2))
    return canvas
icons={}
for name,size,fraction,bg in [('192',192,.84,(11,6,21,255)),('512',512,.84,(11,6,21,255)),('apple',180,.8,(11,6,21,255)),('maskable',512,.60,(11,6,21,255)),('logo',256,1,(0,0,0,0)),('favicon',48,.96,(0,0,0,0))]:
    icons['brand-'+name]=png(square(size,fraction,bg))
badge=square(96,.8)
white=Image.new('RGBA',badge.size,'white');white.putalpha(badge.getchannel('A'))
icons['brand-badge']=png(white)
# Keep old public icon URLs working for existing installs.
Path('src/pwa-icons.ts').write_text('// Generated from the user-supplied transparent D1PSY logo. See scripts/build-brand-icons.py.\nconst brandIcons:Record<string,string>='+json.dumps(icons,separators=(',',':'))+';\nexport const pwaIcons:Record<string,string>={...brandIcons,...Object.fromEntries(["192","512","apple","maskable","badge"].map(name=>[name,brandIcons["brand-"+name]]))};\n')
print({k:len(base64.b64decode(v)) for k,v in icons.items() if k.startswith('brand-')})
