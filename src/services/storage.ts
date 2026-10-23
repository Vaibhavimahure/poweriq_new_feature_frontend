import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const SENSITIVE_STORAGE_KEYS = new Set([
  "@live_alerts_access_token",
  "@live_alerts_refresh_token",
]);

/**
 * Sanitizes keys to satisfy Expo SecureStore requirements:
 * "Keys must not be empty and contain only alphanumeric characters, '.', '-', and '_'."
 */
function toSecureKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "") || "secure_key";
}

class StorageService {
  private isSecureStoreAvailable = Platform.OS === "ios" || Platform.OS === "android";

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_STORAGE_KEYS.has(key) || key.toLowerCase().includes("token");
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (this.isSecureStoreAvailable && this.isSensitiveKey(key)) {
        const secureKey = toSecureKey(key);
        await SecureStore.setItemAsync(secureKey, value);
        // Purge any plaintext copy from AsyncStorage
        await AsyncStorage.removeItem(key).catch(() => {});
        return;
      }
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      if (this.isSensitiveKey(key) && this.isSecureStoreAvailable) {
        console.warn(`[StorageService] SecureStore setItem failed for ${key}, falling back safely:`, e);
        try {
          await AsyncStorage.setItem(key, value);
        } catch (fallbackError) {
          console.error(`Failed to store key: ${key}`, fallbackError);
        }
        return;
      }

      // Safe fallback to AsyncStorage ONLY for non-sensitive data
      try {
        await AsyncStorage.setItem(key, value);
      } catch (fallbackError) {
        console.error(`Failed to store key: ${key}`, fallbackError);
      }
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      if (this.isSecureStoreAvailable && this.isSensitiveKey(key)) {
        const secureKey = toSecureKey(key);
        const item = await SecureStore.getItemAsync(secureKey);
        if (item !== null) return item;

        // Migration fallback: check AsyncStorage if not yet migrated to SecureStore
        const asyncItem = await AsyncStorage.getItem(key);
        if (asyncItem !== null) {
          await SecureStore.setItemAsync(secureKey, asyncItem).catch(() => {});
          await AsyncStorage.removeItem(key).catch(() => {});
          return asyncItem;
        }
        return null;
      }
      return await AsyncStorage.getItem(key);
    } catch (e) {
      if (this.isSensitiveKey(key) && this.isSecureStoreAvailable) {
        console.warn(`[StorageService] SecureStore getItem warning for ${key}:`, e);
        return await AsyncStorage.getItem(key).catch(() => null);
      }
      try {
        return await AsyncStorage.getItem(key);
      } catch (fallbackError) {
        console.error(`Failed to retrieve key: ${key}`, fallbackError);
        return null;
      }
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      if (this.isSecureStoreAvailable && this.isSensitiveKey(key)) {
        await SecureStore.deleteItemAsync(toSecureKey(key)).catch(() => {});
      }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      try {
        await AsyncStorage.removeItem(key);
      } catch (fallbackError) {
        console.error(`Failed to delete key: ${key}`, fallbackError);
      }
    }
  }

  async getObject<T>(key: string): Promise<T | null> {
    const raw = await this.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setObject<T>(key: string, value: T): Promise<void> {
    const str = JSON.stringify(value);
    await this.setItem(key, str);
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (e) {
      console.error("Failed to clear AsyncStorage", e);
    }
  }
}

export const storage = new StorageService();
