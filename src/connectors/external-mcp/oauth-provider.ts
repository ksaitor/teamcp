import { randomBytes } from "crypto";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "@/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { getConfig } from "@/lib/config";

/**
 * OAuthClientProvider backed by the ConnectorOAuth row for one connector.
 * Secret blobs (client info, tokens) are AES-256-GCM encrypted at rest. The
 * SDK's transports call saveTokens() on refresh, so tokens stay current in DB.
 */
export class DbOAuthClientProvider implements OAuthClientProvider {
  /** Captured by redirectToAuthorization() during the SDK auth() flow. */
  authorizationUrl?: URL;

  constructor(private readonly connectorId: string) {}

  private async row() {
    const row = await prisma.connectorOAuth.findUnique({
      where: { connectorId: this.connectorId },
    });
    if (!row) throw new Error("ConnectorOAuth row not found");
    return row;
  }

  get redirectUrl(): string {
    return `${getConfig().APP_URL}/api/connectors/oauth/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "TeamRouter",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  async state(): Promise<string> {
    const state = randomBytes(24).toString("hex");
    await prisma.connectorOAuth.update({
      where: { connectorId: this.connectorId },
      data: { state },
    });
    return state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const row = await this.row();
    if (!row.clientInfoEnc) return undefined;
    return JSON.parse(decrypt(row.clientInfoEnc)) as OAuthClientInformationFull;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await prisma.connectorOAuth.update({
      where: { connectorId: this.connectorId },
      data: { clientInfoEnc: encrypt(JSON.stringify(info)) },
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const row = await this.row();
    if (!row.tokensEnc) return undefined;
    return JSON.parse(decrypt(row.tokensEnc)) as OAuthTokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await prisma.connectorOAuth.update({
      where: { connectorId: this.connectorId },
      data: { tokensEnc: encrypt(JSON.stringify(tokens)) },
    });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await prisma.connectorOAuth.update({
      where: { connectorId: this.connectorId },
      data: { codeVerifier },
    });
  }

  async codeVerifier(): Promise<string> {
    const row = await this.row();
    if (!row.codeVerifier) throw new Error("No PKCE code verifier saved");
    return row.codeVerifier;
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await prisma.connectorOAuth.update({
      where: { connectorId: this.connectorId },
      data: { discoveryState: state as object },
    });
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const row = await this.row();
    return (row.discoveryState as OAuthDiscoveryState | null) ?? undefined;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery"
  ): Promise<void> {
    const data: Record<string, null> = {};
    if (scope === "all" || scope === "client") data.clientInfoEnc = null;
    if (scope === "all" || scope === "tokens") data.tokensEnc = null;
    if (scope === "all" || scope === "verifier") data.codeVerifier = null;
    if (scope === "all" || scope === "discovery") data.discoveryState = null;
    await prisma.connectorOAuth.update({
      where: { connectorId: this.connectorId },
      data,
    });
  }
}
