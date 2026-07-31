import { loadSession } from '../../../auth/session';

export async function GET() {
  return loadSession('request-token');
}
