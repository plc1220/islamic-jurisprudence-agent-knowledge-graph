import { Storage } from '@google-cloud/storage';
import { hash, MODEL, type Store } from './core';

export const PREFIX = 'knowledge-pipeline';
export type Release = { version: string; table: string; model: string; fingerprint: string; documents: number; completed: number; failed: number; edges: number; sections: number; excludedSections: number; uncertainSections: number; createdAt: string; preparedAt: string; inputTable: string; reviewStatus: 'machine-extracted' };
export const tableFor = (version: string) => `graph_release_${hash(version).slice(0, 24)}`;
export function validateRelease(value: any): asserts value is Release {
  if (!value || typeof value.version !== 'string' || value.table !== tableFor(value.version) || value.model !== MODEL || value.reviewStatus !== 'machine-extracted' || typeof value.fingerprint !== 'string' || typeof value.preparedAt !== 'string') throw new Error('Invalid graph release');
  for (const key of ['documents','completed','failed','edges','sections','excludedSections','uncertainSections']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid graph release counts');
  }
  if (!value.edges || value.completed !== value.documents || value.failed) throw new Error('Incomplete graph release');
}

export class CloudStore implements Store {
  constructor(readonly storage: Storage, readonly bucket: string, readonly prefix: string) {}
  file(key: string) { return this.storage.bucket(this.bucket).file(`${this.prefix}/${key}`); }
  async readVersioned<T>(key: string): Promise<{ value: T; generation: string } | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let metadata: any;
      try { [metadata] = await this.file(key).getMetadata(); }
      catch (error: any) { if (Number(error.code) === 404) return null; throw error; }
      try {
        const [bytes] = await this.storage.bucket(this.bucket).file(this.file(key).name, { generation: metadata.generation }).download();
        return { value: JSON.parse(bytes.toString('utf8')) as T, generation: String(metadata.generation) };
      } catch (error: any) {
        if (Number(error.code) !== 404 || attempt === 2) throw error;
      }
    }
    throw new Error('Object changed repeatedly while reading');
  }

  async read<T>(key: string) { return (await this.readVersioned<T>(key))?.value ?? null; }
  async once<T>(key: string, value: T): Promise<T> {
    try {
      await this.file(key).save(JSON.stringify(value), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: 0 } });
      return value;
    } catch (error: any) {
      if (Number(error.code) !== 412) throw error;
      const existing = await this.read<T>(key);
      if (!existing) throw new Error('Checkpoint disappeared after conflict');
      return existing;
    }
  }
  async compareAndSwap<T>(key: string, value: T, generation: string | number) {
    await this.file(key).save(JSON.stringify(value), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: generation } });
  }
}
