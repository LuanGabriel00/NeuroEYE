import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDoctor } from "@/lib/api";

export async function GET() {
  const { response } = await requireDoctor();
  if (response) return response;

  const sessions = await prisma.session.findMany({
    orderBy: { startedAt: "desc" },
    include: { patient: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json({ sessions });
}
