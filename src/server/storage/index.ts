import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";

/**
 * Abstraction de stockage des fichiers téléversés (documents, photos produit).
 * Deux pilotes : « local » (développement, disque unique) et « s3 » (production,
 * bucket privé). Les clés sont générées par l'appelant sous la forme
 * `organisation/aaaa-mm/uuid` ; aucun chemin absolu ni « .. » n'est accepté.
 */
export interface StorageBackend {
  /** Écrit (ou remplace) l'objet désigné par `key`. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Lit l'objet. Lève `NotFoundError` si la clé n'existe pas. */
  get(key: string): Promise<Buffer>;
  /** Supprime l'objet. Ne lève pas si la clé est déjà absente. */
  delete(key: string): Promise<void>;
}

/**
 * Valide une clé de stockage et interdit la traversée de chemin. Les clés
 * légitimes sont relatives, séparées par « / », sans segment vide ni « . »/« .. ».
 */
function assertSafeKey(key: string): string {
  if (!key || key.startsWith("/") || key.includes("\0") || /^[a-z]:/i.test(key)) {
    throw new Error("Clé de stockage invalide");
  }
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error("Clé de stockage invalide");
  }
  return key;
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string; name?: string }).code ?? (error as { name?: string }).name;
  return code === "ENOENT" || code === "NoSuchKey" || code === "NotFound";
}

class LocalStorage implements StorageBackend {
  private readonly root: string;

  constructor(dir: string) {
    this.root = path.resolve(process.cwd(), dir);
  }

  /** Résout une clé en chemin absolu confiné sous `root` (défense en profondeur). */
  private resolve(key: string): string {
    const full = path.resolve(this.root, assertSafeKey(key));
    const base = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (full !== this.root && !full.startsWith(base)) {
      throw new Error("Clé de stockage invalide");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if (isMissing(error)) throw new NotFoundError("Fichier");
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements StorageBackend {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const e = env();
    if (!e.S3_BUCKET) throw new Error("S3_BUCKET est requis lorsque STORAGE_DRIVER=s3");
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
      credentials:
        e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new NotFoundError("Fichier");
      return Buffer.from(bytes);
    } catch (error) {
      if (isMissing(error)) throw new NotFoundError("Fichier");
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }),
    );
  }
}

let cached: StorageBackend | null = null;

/** Renvoie le backend de stockage configuré (instancié une seule fois). */
export function storage(): StorageBackend {
  if (!cached) {
    const e = env();
    cached = e.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage(e.STORAGE_LOCAL_DIR);
  }
  return cached;
}
