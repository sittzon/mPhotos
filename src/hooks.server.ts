import { startFileWatcher } from '$lib/server/filewatcher';

startFileWatcher().catch(console.error);

export const handle = async ({ event, resolve }) => {
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace(
        '<html lang="en">',
        `<html lang="en" class="bg-white">`
      );
    }
  });

  return response;
};