import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ADMIN_SECRET = 'seedance2024';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [totalUsers, creditsAgg, totalVideos, completedVideos] = await Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { credits: true } }),
      prisma.creation.count(),
      prisma.creation.count({ where: { status: 'completed' } }),
    ]);

    return NextResponse.json({
      totalUsers,
      totalCreditsHeld: creditsAgg._sum.credits ?? 0,
      totalVideosGenerated: totalVideos,
      completedVideos,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ADMIN_STATS] Error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
