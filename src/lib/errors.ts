export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class ConnectorError extends AppError {
  constructor(message: string = "Connector unavailable") {
    super(message, 502, "CONNECTOR_ERROR");
    this.name = "ConnectorError";
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string = "Permission denied") {
    super(message, 403, "PERMISSION_DENIED");
    this.name = "PermissionDeniedError";
  }
}

// Raised when single-org tenancy (the OSS default) blocks a second organization
// from being created. The proprietary build's canCreateOrganization hook bypasses
// this.
export class OrgCreationLockedError extends AppError {
  constructor(message: string = "This deployment is already set up.") {
    super(message, 403, "ORG_CREATION_LOCKED");
    this.name = "OrgCreationLockedError";
  }
}

// Raised when single-org tenancy (the OSS default) blocks a stranger from
// self-provisioning an account. The proprietary build's canProvisionUser hook
// bypasses this.
export class ProvisioningLockedError extends AppError {
  constructor(
    message: string = "This deployment is invite-only. Ask your admin for an invite."
  ) {
    super(message, 403, "PROVISIONING_LOCKED");
    this.name = "ProvisioningLockedError";
  }
}
