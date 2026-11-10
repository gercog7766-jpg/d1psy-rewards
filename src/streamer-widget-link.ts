// Render uses the independent relay; a migrated deployment serves OBS on its own domain.
export function widgetBaseForApp(appUrl:string){try{const url=new URL(appUrl);if(url.protocol==='https:'&&!url.hostname.endsWith('.onrender.com'))return url.origin+'/streamer/obs'}catch{}return 'https://dropso-widget.bakedmeadow8.chatgpt.site/'}
export const streamerWidgetBase=widgetBaseForApp(process.env.APP_URL||'');
