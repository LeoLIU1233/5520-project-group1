import { Contract } from 'ethers';

export class Indexer {
  constructor(provider, config, store) {
    this.provider = provider;
    this.config = config;
    this.store = store;
    this.registry = new Contract(config.contractAddress, config.abi, provider);
    const saved = store.getMeta('deploymentId');
    if (saved && saved !== config.deploymentId) throw new Error('The local records database does not match the contract. Restore a complete backup or use the reset command.');
    store.setMeta('deploymentId', config.deploymentId);
    this.inflight = null;
  }

  sync() {
    if (!this.inflight) this.inflight = this.update().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async update() {
    const latest = await this.provider.getBlockNumber();
    let cursor = Number(this.store.getMeta('indexedBlock') ?? (this.config.deploymentBlock - 1));
    if (cursor > latest) {
      // A hard power-off can leave the SQLite index ahead of the last native chain snapshot.
      this.store.db.prepare('DELETE FROM events WHERE block_number > ?').run(latest);
      cursor = this.config.deploymentBlock - 1;
    }
    for (let from = cursor + 1; from <= latest; from += 500) {
      const to = Math.min(from + 499, latest);
      const logs = await this.provider.getLogs({ address: this.config.contractAddress, fromBlock: from, toBlock: to });
      const collected = [];
      const blocks = new Map();
      const receipts = new Map();
      for (const log of logs) {
        const event = this.registry.interface.parseLog(log);
        if (!['CredentialIssued', 'CredentialRevoked'].includes(event?.name)) continue;
        if (!blocks.has(log.blockNumber)) blocks.set(log.blockNumber, await this.provider.getBlock(log.blockNumber));
        if (!receipts.has(log.transactionHash)) receipts.set(log.transactionHash, await this.provider.getTransactionReceipt(log.transactionHash));
        collected.push([
          log.transactionHash, log.index, log.blockNumber, blocks.get(log.blockNumber).timestamp,
          event.name === 'CredentialIssued' ? 'issued' : 'revoked', event.args.credentialId.toLowerCase(),
          event.args.issuer.toLowerCase(), (event.args.revokedBy || event.args.issuer).toLowerCase(),
          String(receipts.get(log.transactionHash)?.gasUsed ?? 0),
        ]);
      }
      this.store.db.exec('BEGIN IMMEDIATE');
      try {
        const insert = this.store.db.prepare('INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of collected) insert.run(...row);
        this.store.setMeta('indexedBlock', to);
        this.store.db.exec('COMMIT');
      } catch (error) { this.store.db.exec('ROLLBACK'); throw error; }
    }
  }

  events(credentialId) {
    return credentialId ? this.store.db.prepare('SELECT * FROM events WHERE credential_id = ? ORDER BY block_number,log_index').all(credentialId) :
      this.store.db.prepare('SELECT * FROM events ORDER BY block_number DESC,log_index DESC LIMIT 10').all();
  }

  async records({ account, issuer, status, query = '' } = {}) {
    await this.sync();
    const ids = this.store.db.prepare('SELECT DISTINCT credential_id FROM events').all().map(row => row.credential_id);
    if (account) {
      const admin = await this.registry.hasRole(await this.registry.DEFAULT_ADMIN_ROLE(), account);
      const drafts = admin ? this.store.db.prepare('SELECT credential_id FROM vault').all() :
        this.store.db.prepare('SELECT credential_id FROM vault WHERE owner = ?').all(account);
      for (const row of drafts) if (!ids.includes(row.credential_id)) ids.push(row.credential_id);
    }
    const profiles = this.store.db.prepare('SELECT * FROM profiles').all();
    const isAdmin = account ? await this.registry.hasRole(await this.registry.DEFAULT_ADMIN_ROLE(), account) : false;
    const output = [];
    for (const id of ids) {
      const record = await this.registry.getCredential(id);
      const backup = this.store.db.prepare('SELECT * FROM vault WHERE credential_id = ?').get(id);
      if (!record.exists && !backup) continue;
      const owner = record.exists ? record.issuer.toLowerCase() : backup.owner;
      const allowed = !!account && (account === owner || isAdmin);
      const matchingBackup = backup && backup.owner === owner && (!record.exists || backup.commitment === record.commitment);
      if (!record.exists && !allowed) continue;
      const item = {
        credentialId: id, issuer: owner, issuerName: profiles.find(row => row.address === owner)?.name || 'Organisation name not registered',
        status: record.exists ? (record.revoked ? 'REVOKED' : 'VALID') : 'DRAFT',
        issuedAt: Number(record.issuedAt), revokedAt: Number(record.revokedAt),
        title: allowed && matchingBackup ? backup.title : 'Credential record',
        filename: allowed && matchingBackup ? backup.filename : '',
        canExport: allowed && !!matchingBackup, canResume: allowed && !!matchingBackup && !record.exists && owner === account,
        events: this.events(id),
      };
      if (issuer && owner !== issuer) continue;
      if (status && item.status !== status) continue;
      if (query && ![item.credentialId, item.issuer, item.issuerName, item.title].some(value => value.toLowerCase().includes(query.toLowerCase()))) continue;
      output.push(item);
    }
    return output.sort((a,b) => b.issuedAt - a.issuedAt);
  }
}
