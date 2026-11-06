import { NextResponse } from "next/server";
import { getCurrentDoctor } from "@/lib/session";

export async function GET() {
  const doctor = await getCurrentDoctor();
  if (!doctor) return NextResponse.json({ doctor: null }, { status: 401 });
  return NextResponse.json({ doctor });
}
