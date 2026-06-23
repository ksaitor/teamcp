import type { PermissionResult } from "./engine";

/**
 * Layer 2: Connector-native permission checks.
 * Validates against connector-specific permission configs.
 */
export function checkNativePermissions(
  connectorType: string,
  nativePermissions: Record<string, any> | null,
  toolName: string,
  params: Record<string, any>
): PermissionResult {
  if (!nativePermissions) {
    return { allowed: true, layer: "native" };
  }

  switch (connectorType) {
    case "POSTGRES":
      return checkPostgresPermissions(nativePermissions, toolName, params);
    case "MYSQL":
      return checkMysqlPermissions(nativePermissions, toolName, params);
    case "MONGODB":
      return checkMongoPermissions(nativePermissions, toolName, params);
    case "STRIPE":
      return checkStripePermissions(nativePermissions, toolName);
    case "S3":
      return checkS3Permissions(nativePermissions, params);
    default:
      return { allowed: true, layer: "native" };
  }
}

function checkPostgresPermissions(
  perms: Record<string, any>,
  toolName: string,
  params: Record<string, any>
): PermissionResult {
  const { allowedSchemas, allowedTables } = perms;

  // For describe_table and query, check table restrictions
  if (allowedTables && allowedTables.length > 0) {
    if (toolName === "pg_describe_table" && params.table) {
      if (!allowedTables.includes(params.table)) {
        return {
          allowed: false,
          reason: `Table '${params.table}' is not in the allowed tables list`,
          layer: "native",
        };
      }
    }

    // Basic SQL table check — not a full parser, but catches simple cases
    if (
      (toolName === "pg_query" || toolName === "pg_execute") &&
      params.sql
    ) {
      const sql = params.sql.toLowerCase();
      for (const table of allowedTables) {
        // This is a basic check — AI layer handles more nuanced filtering
        if (sql.includes(table.toLowerCase())) {
          return { allowed: true, layer: "native" };
        }
      }
      // If SQL doesn't mention any allowed tables, it might be accessing restricted ones
      // Let it through for now — AI layer will catch detailed violations
    }
  }

  // Schema check
  if (allowedSchemas && allowedSchemas.length > 0) {
    if (
      (toolName === "pg_list_tables" || toolName === "pg_describe_table") &&
      params.schema
    ) {
      if (!allowedSchemas.includes(params.schema)) {
        return {
          allowed: false,
          reason: `Schema '${params.schema}' is not in the allowed schemas list`,
          layer: "native",
        };
      }
    }
  }

  return { allowed: true, layer: "native" };
}

function checkMysqlPermissions(
  perms: Record<string, any>,
  toolName: string,
  params: Record<string, any>
): PermissionResult {
  const { allowedSchemas, allowedTables } = perms;

  // For describe_table, check table restrictions
  if (allowedTables && allowedTables.length > 0) {
    if (toolName === "mysql_describe_table" && params.table) {
      if (!allowedTables.includes(params.table)) {
        return {
          allowed: false,
          reason: `Table '${params.table}' is not in the allowed tables list`,
          layer: "native",
        };
      }
    }

    // Basic SQL table check — not a full parser, but catches simple cases
    if (
      (toolName === "mysql_query" || toolName === "mysql_execute") &&
      params.sql
    ) {
      const sql = params.sql.toLowerCase();
      for (const table of allowedTables) {
        // This is a basic check — AI layer handles more nuanced filtering
        if (sql.includes(table.toLowerCase())) {
          return { allowed: true, layer: "native" };
        }
      }
      // If SQL doesn't mention any allowed tables, it might be accessing restricted ones
      // Let it through for now — AI layer will catch detailed violations
    }
  }

  // Schema check
  if (allowedSchemas && allowedSchemas.length > 0) {
    if (
      (toolName === "mysql_list_tables" || toolName === "mysql_describe_table") &&
      params.schema
    ) {
      if (!allowedSchemas.includes(params.schema)) {
        return {
          allowed: false,
          reason: `Schema '${params.schema}' is not in the allowed schemas list`,
          layer: "native",
        };
      }
    }
  }

  return { allowed: true, layer: "native" };
}

function checkMongoPermissions(
  perms: Record<string, any>,
  toolName: string,
  params: Record<string, any>
): PermissionResult {
  const { allowedCollections } = perms;

  if (
    allowedCollections &&
    allowedCollections.length > 0 &&
    params.collection
  ) {
    if (!allowedCollections.includes(params.collection)) {
      return {
        allowed: false,
        reason: `Collection '${params.collection}' is not in the allowed collections list`,
        layer: "native",
      };
    }
  }

  return { allowed: true, layer: "native" };
}

function checkS3Permissions(
  perms: Record<string, any>,
  params: Record<string, any>
): PermissionResult {
  const { allowedBuckets } = perms;

  // When `bucket` is omitted the call falls back to the connector's configured
  // default bucket, which the admin set explicitly — so only enforce the list
  // when a bucket is actually named in the call.
  if (allowedBuckets && allowedBuckets.length > 0 && params.bucket) {
    if (!allowedBuckets.includes(params.bucket)) {
      return {
        allowed: false,
        reason: `Bucket '${params.bucket}' is not in the allowed buckets list`,
        layer: "native",
      };
    }
  }

  return { allowed: true, layer: "native" };
}

function checkStripePermissions(
  perms: Record<string, any>,
  toolName: string
): PermissionResult {
  const { scopes } = perms;

  if (scopes && scopes.length > 0) {
    // Map tool names to required scopes
    const toolScopeMap: Record<string, string> = {
      stripe_list_customers: "read:customers",
      stripe_get_customer: "read:customers",
      stripe_list_charges: "read:charges",
      stripe_get_invoice: "read:invoices",
      stripe_list_subscriptions: "read:subscriptions",
      stripe_create_refund: "write:refunds",
      stripe_update_customer: "write:customers",
    };

    const requiredScope = toolScopeMap[toolName];
    if (requiredScope && !scopes.includes(requiredScope)) {
      return {
        allowed: false,
        reason: `Missing required scope: ${requiredScope}`,
        layer: "native",
      };
    }
  }

  return { allowed: true, layer: "native" };
}
