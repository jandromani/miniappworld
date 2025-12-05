import { NextRequest, NextResponse } from 'next/server';
import { logApiEvent } from '@/lib/apiError';
import { listTournaments, serializeTournament } from '@/lib/server/tournamentData';
import { validateCriticalEnvVars } from '@/lib/envValidation';

const ALLOWED_STATUSES = ['upcoming', 'active', 'finished'];

export async function GET(req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilters = statusParam?.split(',').filter(Boolean);
  const searchParams = req.nextUrl.searchParams;
  const statusParam = searchParams.get('status');
  const searchTerm = searchParams.get('search')?.trim();
  const pageParam = searchParams.get('page');
  const pageSizeParam = searchParams.get('pageSize');

  const statusFilters = statusParam
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (statusFilters?.length) {
    const invalidStatus = statusFilters.find((status) => !ALLOWED_STATUSES.includes(status.toLowerCase()));
    if (invalidStatus) {
      return NextResponse.json(
        { message: `Estado no válido: ${invalidStatus}. Estados permitidos: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
  }

  const page = pageParam ? Number(pageParam) : 1;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : 10;

  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ message: 'El parámetro "page" debe ser un entero mayor o igual a 1.' }, { status: 400 });
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return NextResponse.json(
      { message: 'El parámetro "pageSize" debe ser un entero entre 1 y 100.' },
      { status: 400 }
    );
  }

  const tournaments = await listTournaments(statusFilters);

  logApiEvent('info', {
    path: 'tournaments',
    action: 'list',
    filters: statusFilters,
    count: serialized.length,
  });

  return NextResponse.json(serialized);
  const filtered = searchTerm
    ? tournaments.filter((tournament) => tournament.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : tournaments;

  const offset = (page - 1) * pageSize;
  const paginated = filtered.slice(offset, offset + pageSize);

  const serialized = await Promise.all(paginated.map((tournament) => serializeTournament(tournament)));

  const response = NextResponse.json(serialized);
  response.headers.set('X-Total-Count', filtered.length.toString());
  response.headers.set('X-Page', page.toString());
  response.headers.set('X-Page-Size', pageSize.toString());

  return response;
}
