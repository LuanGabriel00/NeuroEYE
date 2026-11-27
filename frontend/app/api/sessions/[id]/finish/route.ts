import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionFinishSchema } from "@/lib/validation";
import { handleApiError, jsonError, requireDoctor } from "@/lib/api";

// Ends a recording session and stores the raw metrics the device/analysis
// pipeline produced. This intentionally does not decide CONCLUIDA vs
// SINALIZADA from trackingAccuracy — that scale isn't defined yet. A
// finished session always lands in CONCLUIDA; flagging is a separate,
// manual step via PATCH /api/sessions/[id]/status.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  try {
    const { id } = await params;
    const existing = await prisma.session.findUnique({ where: { id } });
    if (!existing) return jsonError("Sessão não encontrada", 404);

    const body = await request.json();
    const data = sessionFinishSchema.parse(body);

    const session = await prisma.session.update({
      where: { id },
      data: {
        status: "CONCLUIDA",
        endedAt: new Date(),
        durationSeconds: data.durationSeconds,
        trackingAccuracy: data.trackingAccuracy,
        avgLatencyMs: data.avgLatencyMs,
        saccadeCount: data.saccadeCount,
        fixationDurationMs: data.fixationDurationMs,
        ...(data.series
          ? {
              trackingPoints: {
                deleteMany: {},
                create: data.series,
              },
            }
          : {}),
      },
      include: { trackingPoints: true },
    });

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}
