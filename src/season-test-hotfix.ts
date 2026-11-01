import express from 'express';
export function installSeasonTestHotfix(){const response:any=(express as any).response,os=response.send;response.send=function(body:any){const req:any=(this as any).req;if(req?.path==='/season'&&typeof body==='string'){body=body.replace('</head>','<style id="seasonTestUi">#bpNeed{display:none!important}</style></head>');}return os.call(this,body)}}
