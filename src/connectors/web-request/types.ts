export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type AuthType = "NONE" | "BEARER" | "HEADER" | "BASIC";

export type ParamLocation = "query" | "body" | "path";
export type ParamType = "string" | "number" | "boolean";

export interface ParamDef {
  name: string;
  in: ParamLocation;
  type: ParamType;
  required: boolean;
  description?: string;
}

export interface StaticHeader {
  name: string;
  value: string;
}

export interface AuthConfig {
  type: AuthType;
  headerName?: string;
}

export type BodyFormat = "json" | "form";

export interface WebRequestConfig {
  url: string;
  method: HttpMethod;
  toolName: string;
  toolDescription: string;
  staticHeaders: StaticHeader[];
  auth: AuthConfig;
  params: ParamDef[];
  bodyFormat: BodyFormat;
}

export interface WebRequestCredentials {
  secret: string;
}
