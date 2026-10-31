import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { ChunkedSessionStorage, SecretStore, SessionCodec } from './SessionChunks';

class AssetSecretStore implements SecretStore {
  private encoder: util.TextEncoder = new util.TextEncoder();
  private decoder: util.TextDecoder = new util.TextDecoder('utf-8');
  private attributes(alias: string): asset.AssetMap {
    const fields: asset.AssetMap = new Map();
    fields.set(asset.Tag.ALIAS, this.encoder.encodeInto(alias));
    return fields;
  }
  async get(alias: string): Promise<Uint8Array | null> {
    const query = this.attributes(alias);
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const values = await asset.query(query);
      if (values.length !== 1) throw new Error('Invalid secure item');
      const value = values[0].get(asset.Tag.SECRET);
      if (!(value instanceof Uint8Array)) throw new Error('Invalid secure item');
      return value;
    } catch (error) {
      if ((error as BusinessError).code === asset.ErrorCode.NOT_FOUND) return null;
      throw new Error('账号安全存储不可用，请解锁设备后重试。');
    }
  }
  async put(alias: string, bytes: Uint8Array, label: string): Promise<void> {
    const fields = this.attributes(alias);
    fields.set(asset.Tag.SECRET, bytes);
    fields.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
    fields.set(asset.Tag.AUTH_TYPE, asset.AuthType.NONE);
    fields.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
    fields.set(asset.Tag.DATA_LABEL_NORMAL_1, this.encoder.encodeInto(label));
    fields.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    await asset.add(fields);
  }
  async remove(alias: string): Promise<void> {
    try { await asset.remove(this.attributes(alias)); }
    catch (error) { if ((error as BusinessError).code !== asset.ErrorCode.NOT_FOUND) throw new Error('无法清理账号安全存储，请解锁后重试。'); }
  }
  async list(label: string): Promise<string[]> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.DATA_LABEL_NORMAL_1, this.encoder.encodeInto(label));
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ATTRIBUTES);
    try {
      const items = await asset.query(query);
      const names: string[] = [];
      for (const item of items) {
        const name = item.get(asset.Tag.ALIAS);
        if (name instanceof Uint8Array) names.push(this.decoder.decodeToString(name));
      }
      return names;
    } catch (error) {
      if ((error as BusinessError).code === asset.ErrorCode.NOT_FOUND) return [];
      throw new Error('无法检查账号安全存储，请解锁后重试。');
    }
  }
}
class AssetCodec implements SessionCodec {
  encode(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value); }
  decode(value: Uint8Array): string { return new util.TextDecoder('utf-8').decodeToString(value); }
  generation(): string { return util.generateRandomUUID(); }
}

export class SessionVault extends ChunkedSessionStorage {
  constructor() { super(new AssetSecretStore(), new AssetCodec()); }
}
