export async function resolve(specifier, context, nextResolve) {
  if (specifier === './paused-features.js' && context.parentURL?.endsWith('/src/server-entry.ts')) {
    return { url: 'data:text/javascript,export function installPausedFeatures(){}', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
