import express from 'express';

// Legacy hotfix intentionally disabled: upgrader-consumed items must remain
// visible in account history and be rendered as ПРОИГРАН by inventory V2.
export function installAccountUpgradedHideHotfix(){
  const response:any=(express as any).response;
  response.__accountUpgradedHideV1=true;
}
