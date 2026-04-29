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
    const [totalUsers, creditsAgg, totalVideos, completedVideos, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { credits: true } }),
      prisma.creation.count(),
      prisma.creation.count({ where: { status: 'completed' } }),
      prisma.user.findMany({ select: { id: true, name: true, email: true, credits: true, createdAt: false }, orderBy: { id: 'asc' } }),
    ]);

    return NextResponse.json({
      totalUsers,
      totalCreditsHeld: creditsAgg._sum.credits ?? 0,
      totalVideosGenerated: totalVideos,
      completedVideos,
      users,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ADMIN_STATS] Error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
