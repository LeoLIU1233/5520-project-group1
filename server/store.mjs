import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = directory;
    const keyPath = path.join(directory, 'vault.key');
    const databasePath = path.join(directory, 'registry.sqlite');
    if (!existsSync(keyPath) && existsSync(databasePath)) {
      throw new Error('The records encryption key is missing. Restore a complete data backup rather than replacing only the database.');
    }
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('The records encryption key is damaged. Restore a complete backup.');
    this.db = new DatabaseSync(databasePath);
    chmodSync(databasePath, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, block_number INTEGER NOT NULL,
        timestamp INTEGER NOT NULL, kind TEXT NOT NULL, credential_id TEXT NOT NULL,
        issuer TEXT NOT NULL, actor TEXT NOT NULL, gas_used TEXT NOT NULL,
        PRIMARY KEY(tx_hash, log_index)
      );
      CREATE INDEX IF NOT EXISTS events_credential ON events(credential_id);
      CREATE TABLE IF NOT EXISTS vault (
        credential_id TEXT PRIMARY KEY, owner TEXT NOT NULL, commitment TEXT NOT NULL,
        title TEXT NOT NULL, filename TEXT NOT NULL, encrypted TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        address TEXT PRIMARY KEY, name TEXT NOT NULL, reviewed_by TEXT NOT NULL,
        reviewed_at INTEGER NOT NULL, source TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_history (
        id INTEGER PRIMARY KEY, address TEXT NOT NULL, name TEXT NOT NULL,
        reviewed_by TEXT NOT NULL, reviewed_at INTEGER NOT NULL, source TEXT NOT NULL
      );
    `);
  }

  encrypt(value, credentialId) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(credentialId));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') });
  }

  decrypt(row) {
    const { iv, tag, ciphertext } = JSON.parse(row.encrypted);
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
    decipher.setAAD(Buffer.from(row.credential_id));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString());
  }

  savePackage({ credentialId, owner, commitment, title, filename, verification }) {
    const previous = this.db.prepare('SELECT * FROM vault WHERE credential_id = ?').get(credentialId);
    if (previous && (previous.owner !== owner || previous.commitment !== commitment || this.decrypt(previous).salt !== verification.salt)) {
      throw new Error('A backup already exists for this credential ID. It cannot be overwritten or assigned a different salt.');
    }
    if (!previous) this.db.prepare('INSERT INTO vault VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      credentialId, owner, commitment, title, filename, this.encrypt(verification, credentialId), Date.now(),
    );
    return previous || this.db.prepare('SELECT * FROM vault WHERE credential_id = ?').get(credentialId);
  }

  saveProfile(address, name, reviewedBy, source = 'administrator') {
    const timestamp = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO profiles VALUES (?, ?, ?, ?, ?)').run(address, name, reviewedBy, timestamp, source);
      this.db.prepare('INSERT INTO profile_history(address,name,reviewed_by,reviewed_at,source) VALUES (?, ?, ?, ?, ?)').run(address, name, reviewedBy, timestamp, source);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  getMeta(key) { return this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value; }
  setMeta(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(key, String(value)); }
  close() { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db.close(); }
}
