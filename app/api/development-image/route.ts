import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  const image = await readFile(join(process.cwd(), 'assets', 'icone-em-desenvolvimento.png'));

  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
