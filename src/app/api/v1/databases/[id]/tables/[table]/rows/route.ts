import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { DatabaseService } from "@/modules/databases/database-service";
import { RecordService } from "@/modules/databases/record-service";
import { resolveTablePermissions } from "@/lib/permissions/resolver";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; table: string }> }
) {
  try {
    const params = await props.params;
    const { context, database } = await requireDatabaseAccessById(params.id, "query:read");
    const { searchParams } = new URL(req.url);

    const schema = searchParams.get("schema") || "public";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
    const orderBy = searchParams.get("orderBy") || undefined;
    const orderDir = (searchParams.get("orderDir") as "ASC" | "DESC") || undefined;

    const result = await DatabaseService.fetchTableRows({
      databaseId: database.id,
      schema,
      table: params.table,
      limit,
      offset,
      orderBy,
      orderDir,
    });

    const permissions = resolveTablePermissions(
      context.effectivePermissions,
      context.databaseGrants
    );

    return NextResponse.json({
      table: params.table,
      schema,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      durationMs: result.durationMs,
      limit,
      offset,
      permissions,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; table: string }> }
) {
  try {
    const params = await props.params;
    const { context, database } = await requireDatabaseAccessById(params.id);
    const tablePerms = resolveTablePermissions(
      context.effectivePermissions,
      context.databaseGrants
    );

    if (!tablePerms.canUpdate) {
      return NextResponse.json(
        {
          error: "Forbidden: You do not have UPDATE permission on this database table.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (!body.primaryKey || typeof body.primaryKey !== "object") {
      return NextResponse.json(
        { error: "Missing primaryKey identifier object.", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    if (!body.changes || typeof body.changes !== "object") {
      return NextResponse.json(
        { error: "Missing changes object.", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const updated = await RecordService.updateRecord({
      databaseId: database.id,
      schema: body.schema || "public",
      table: params.table,
      primaryKey: body.primaryKey,
      changes: body.changes,
      originalRow: body.originalRow,
      actor: {
        id: context.userId,
        email: context.email,
        organizationId: context.organizationId,
      },
    });

    return NextResponse.json({
      success: true,
      record: updated.record,
      changedColumns: updated.changedColumns,
    });
  } catch (err: any) {
    if (err?.code === "CONCURRENCY_CONFLICT") {
      return NextResponse.json(
        {
          error: err.message,
          code: "CONCURRENCY_CONFLICT",
          currentRecord: err.currentRecord,
        },
        { status: 409 }
      );
    }
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string; table: string }> }
) {
  try {
    const params = await props.params;
    const { context, database } = await requireDatabaseAccessById(params.id);
    const tablePerms = resolveTablePermissions(
      context.effectivePermissions,
      context.databaseGrants
    );

    if (!tablePerms.canInsert) {
      return NextResponse.json(
        {
          error: "Forbidden: You do not have INSERT permission on this database table.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { error: "Missing data payload for record insertion.", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const created = await RecordService.insertRecord({
      databaseId: database.id,
      schema: body.schema || "public",
      table: params.table,
      data: body.data,
      actor: {
        id: context.userId,
        email: context.email,
        organizationId: context.organizationId,
      },
    });

    return NextResponse.json(
      { success: true, record: created.record },
      { status: 201 }
    );
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string; table: string }> }
) {
  try {
    const params = await props.params;
    const { context, database } = await requireDatabaseAccessById(params.id);
    const tablePerms = resolveTablePermissions(
      context.effectivePermissions,
      context.databaseGrants
    );

    if (!tablePerms.canDelete) {
      return NextResponse.json(
        {
          error: "Forbidden: You do not have DELETE permission on this database table.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (!body.primaryKey || typeof body.primaryKey !== "object") {
      return NextResponse.json(
        { error: "Missing primaryKey identifier object.", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const deleted = await RecordService.deleteRecord({
      databaseId: database.id,
      schema: body.schema || "public",
      table: params.table,
      primaryKey: body.primaryKey,
      originalRow: body.originalRow,
      actor: {
        id: context.userId,
        email: context.email,
        organizationId: context.organizationId,
      },
    });

    return NextResponse.json({
      success: true,
      deletedRecord: deleted.deletedRecord,
    });
  } catch (err: any) {
    if (err?.code === "CONCURRENCY_CONFLICT") {
      return NextResponse.json(
        {
          error: err.message,
          code: "CONCURRENCY_CONFLICT",
          currentRecord: err.currentRecord,
        },
        { status: 409 }
      );
    }
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
