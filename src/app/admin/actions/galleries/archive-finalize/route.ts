import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  objectKey: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(260),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "Server is missing DATABASE_URL configuration." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const updated = await prisma.gallery.update({
      where: { id: parsed.galleryId },
      data: {
        archiveObjectKey: parsed.objectKey,
        archiveFilename: parsed.filename,
        archiveUploadedAt: new Date(),
      },
      select: {
        id: true,
        archiveObjectKey: true,
      },
    });

    return NextResponse.json({
      ok: true,
      galleryId: updated.id,
      archiveObjectKey: updated.archiveObjectKey,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid archive finalize payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Unable to finalize archive upload." }, { status: 500 });
  }
}
