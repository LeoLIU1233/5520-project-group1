import React, { useEffect, useState } from 'react';
import { Building2, Download, FolderOpen, Search, RefreshCw, BookOpen, LockKeyhole, FileCheck2, Wallet, LoaderCircle } from 'lucide-react';
import { isAddress } from 'ethers';

const short = value => `${value.slice(0, 8)}…${value.slice(-6)}`;
const when = timestamp => timestamp ? new Date(timestamp * 1000).toLocaleString('en-GB', { hour12: false }) : 'Not yet registered';
const names = { VALID: 'Not revoked', REVOKED: 'Revoked', DRAFT: 'Pending registration' };

export function Documents({ apiRequest, ensureSession, session, activeAddress, roles, connected, busy, transact, setNotice, downloadJson, setTab }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ records: [], total: 0, pageSize: 10 });
  const [refresh, setRefresh] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); }, [query, status, mine, activeAddress]);
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    const load = async () => {
      try {
        const params = new URLSearchParams({ query, status, page: String(page) });
        if (mine && activeAddress) params.set('issuer', activeAddress);
        const result = await apiRequest(`/api/credentials?${params}`);
        if (!stopped) { setData(result); setError(''); }
      } catch (reason) { if (!stopped) setError(reason.message); }
    };
    const debounce = setTimeout(load, 150);
    const poll = setInterval(load, 5000);
    return () => { stopped = true; clearTimeout(debounce); clearInterval(poll); };
  }, [connected, query, status, mine, page, activeAddress, session?.token, refresh]);

  async function exportPackage(record, resume = false) {
    setWorking(true); setNotice(null);
    try {
      const token = await ensureSession();
      const payload = await apiRequest(`/api/credentials/${record.credentialId}/package`, {}, token);
      if (resume) {
        const receipt = await transact('The pending credential has been registered on-chain.', registry => registry.issueCredential(record.credentialId, payload.commitment));
        if (receipt) setRefresh(value => value + 1);
      } else {
        downloadJson(payload.verification, `verification-${record.credentialId.slice(2, 10)}.json`);
        setNotice({ kind: 'success', message: 'Verification package re-exported. Share it with the original PDF.' });
      }
    } catch (reason) { setNotice({ kind: 'error', message: reason.message }); }
    finally { setWorking(false); }
  }

  return <section className="panel documents-panel"><div className="panel-heading"><div><h2><FolderOpen size={20}/>Credential records</h2><p>Status is read from the contract. Private titles and file names are shown only to the signed-in issuer or administrator.</p></div><button className="button secondary small" onClick={() => setRefresh(value => value + 1)} disabled={!connected || working}><RefreshCw size={14}/>Refresh</button></div>
    <div className="document-filters"><div className="search-field"><Search size={17}/><input aria-label="Search credentials" placeholder="Search by ID, issuer or your private title" value={query} onChange={event => setQuery(event.target.value)}/></div><select aria-label="Filter credential status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="VALID">Not revoked</option><option value="REVOKED">Revoked</option><option value="DRAFT">Pending registration</option></select></div>
    <div className="document-toolbar"><label className="checkbox-label"><input type="checkbox" checked={mine} disabled={!activeAddress} onChange={event => setMine(event.target.checked)}/>Only credentials issued by this account</label><span className="muted">{data.total} {data.total === 1 ? 'record' : 'records'}</span></div>
    {!session && <div className="document-login"><LockKeyhole size={17}/><p>Public records are available without signing in. Sign in to view your private backups and pending registrations.</p><button className="text-button" disabled={working || !connected || !activeAddress} onClick={async () => { setWorking(true); try { await ensureSession(); } catch (reason) { setNotice({ kind: 'error', message: reason.message }); } finally { setWorking(false); } }}>Sign in with wallet</button></div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="document-list">{data.records.map(record => {
      const owner = activeAddress?.toLowerCase() === record.issuer;
      return <article className="document-record" key={record.credentialId}>
        <div className="document-record-heading"><div><h3>{record.title}</h3><p>{record.issuerName}</p></div><span className={`record-status ${record.status.toLowerCase()}`}>{names[record.status]}</span></div>
        <code className="document-id">{record.credentialId}</code>
        <div className="document-meta"><span>Registered: {when(record.issuedAt)}</span>{record.revokedAt > 0 && <span>Revoked: {when(record.revokedAt)}</span>}</div>
        {record.filename && <p className="document-filename">Original file: {record.filename} (keep the original PDF yourself)</p>}
        <div className="document-actions">{(owner || roles.admin) && <button className="button secondary small" disabled={busy || working} onClick={() => exportPackage(record)}><Download size={14}/>Re-export verification package</button>}{record.canResume && <button className="button primary small" disabled={busy || working} onClick={() => exportPackage(record, true)}><FileCheck2 size={14}/>Complete registration</button>}{record.status !== 'DRAFT' && <button className="text-button" onClick={() => { navigator.clipboard.writeText(record.credentialId).then(() => setNotice({ kind: 'success', message: 'Credential ID copied. Paste it into the verification or revocation form.' })).catch(() => setNotice({ kind: 'error', message: 'Clipboard access was denied. Select and copy the credential ID above manually.' })); }}>Copy credential ID</button>}</div>
        <details className="history-details"><summary>Registration and revocation history ({record.events.length} {record.events.length === 1 ? 'event' : 'events'})</summary>{record.events.length ? record.events.map(event => <div className="history-event" key={`${event.tx_hash}-${event.log_index}`}><strong>{event.kind === 'issued' ? 'Registration' : 'Revocation'}</strong><span>{when(event.timestamp)}</span><span>Actor {short(event.actor)} · Block #{event.block_number}</span><code title={event.tx_hash}>{event.tx_hash}</code><span>Transaction gas: {event.gas_used}</span></div>) : <p>Verification data is backed up, but registration is not complete. Continue registration now or keep the backup for later.</p>}</details>
      </article>;
    })}</div>
    {!data.records.length && !error && <div className="document-empty"><FolderOpen size={30}/><p>No credentials match these filters.</p><button className="text-button" onClick={() => setTab('issue')}>Go to issuer workspace</button></div>}
    <div className="pagination"><button className="button secondary small" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button className="button secondary small" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
  </section>;
}

export function Profiles({ config, connected, busy, transact, issuers, ensureSession, apiRequest, setNotice, refreshLedger, CopyValue }) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState('');

  async function authorise(event) {
    event.preventDefault(); setSaving(true);
    try {
      const token = await ensureSession();
      const receipt = await transact('Issuer authorised. Saving the organisation name…', registry => registry.authorizeIssuer(address));
      if (!receipt) return;
      await apiRequest('/api/profiles', { method: 'POST', body: { address, name, reviewed } }, token);
      await refreshLedger();
      setAddress(''); setName(''); setReviewed(false);
      setNotice({ kind: 'success', message: 'Issuer authorised and organisation name recorded by the administrator.', hash: receipt.hash });
    } catch (reason) { setNotice({ kind: 'error', message: `${reason.message} If the authorisation transaction succeeded, submit again to save the name.` }); }
    finally { setSaving(false); }
  }

  return <><section className="panel"><div className="panel-heading"><div><h2>Authorise an issuer</h2><p>Check the organisation and its wallet off-chain before authorising and recording its name. A name record does not prove its claims.</p></div><span className="tag">ADMIN</span></div><form onSubmit={authorise}>
    <label className="input-label" htmlFor="issuer-name">Organisation name</label><input id="issuer-name" required maxLength={80} placeholder="For example: Harbour Academy (classroom demo)" value={name} disabled={busy || saving} onChange={event => setName(event.target.value)}/>
    <label className="input-label" htmlFor="issuer-address">Issuer wallet address</label><input id="issuer-address" required className="mono" pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" value={address} disabled={busy || saving} onChange={event => setAddress(event.target.value)}/>
    <div className="address-shortcuts">{config?.demoAccounts.slice(1,3).map(account => <button type="button" key={account.address} className="text-button" disabled={busy || saving} onClick={() => { setAddress(account.address); setName(account.organization); }}>Use {account.label}</button>)}</div>
    <label className="checkbox-label"><input type="checkbox" required checked={reviewed} onChange={event => setReviewed(event.target.checked)} disabled={busy || saving}/>I have checked the organisation identity and wallet address off-chain (classroom samples use fictional organisations).</label>
    <button type="submit" className="button primary" disabled={!connected || busy || saving || !isAddress(address) || !name.trim() || !reviewed}>{saving ? <LoaderCircle size={17} className="spin"/> : <Building2 size={17}/>}Authorise and save name</button>
  </form></section>
  <section className="panel"><div className="panel-heading"><div><h2>Issuer permissions</h2><p>Deactivation stops new issuance. The original address can still revoke old credentials; a compromised key requires separate governance action.</p></div><span className="count-label">{issuers.length}</span></div>
    <div className="issuer-list">{issuers.map(issuer => <div className="issuer-row" key={issuer.address}><div className="issuer-avatar"><Building2 size={20}/></div><div className="issuer-info"><strong>{issuer.name}</strong><CopyValue value={issuer.address} label="issuer address" compact/><small className="profile-source">{issuer.source === 'classroom-sample' ? 'Preloaded classroom sample name' : issuer.source === 'administrator' ? 'Name recorded by administrator' : 'No organisation profile recorded'}</small></div><span className={`role-chip ${issuer.authorised ? 'authorised' : ''}`}>{issuer.authorised ? 'Authorised' : 'Inactive'}</span><button className="text-button" disabled={busy || saving} onClick={() => { setAddress(issuer.address); setName(issuer.name); setReviewed(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit name</button>{issuer.authorised ? <button className="text-button danger-text" disabled={busy || saving} onClick={() => setDeactivateTarget(issuer.address)}>Deactivate</button> : <button className="text-button" disabled={busy || saving} onClick={() => transact('Issuer reauthorised.', registry => registry.authorizeIssuer(issuer.address))}>Reauthorise</button>}</div>)}</div>
    {deactivateTarget && <div className="confirmation" role="group" aria-label="Confirm issuer deactivation"><p>Deactivate issuance for {short(deactivateTarget)}? Historical credentials keep their current status.</p><button className="button danger small" disabled={busy} onClick={async () => { if (await transact('Issuer deactivated. This account can no longer issue credentials.', registry => registry.deactivateIssuer(deactivateTarget))) setDeactivateTarget(''); }}>Confirm deactivation</button><button className="button secondary small" disabled={busy} onClick={() => setDeactivateTarget('')}>Cancel</button></div>}
  </section></>;
}

export function BeginnerGuide({ setTab }) {
  return <section className="panel beginner-guide"><div className="panel-heading"><div><h2><BookOpen size={20}/>First time? Start here.</h2><p>Start with demo accounts, then rehearse with an independent wallet. The handbook covers setup, expected results and troubleshooting.</p></div><a className="button secondary small" href="/guide.html" target="_blank" rel="noreferrer">Open the full beginner handbook</a></div>
    <ol className="guide-steps"><li><strong>Try verification first</strong><p>Open Verify credentials, select Load valid sample, then Verify credential. Expect VALID. The altered PDF produces HASH_MISMATCH.</p><button className="text-button" onClick={() => setTab('verify')}>Go to verification</button></li><li><strong>Authorise a new issuer</strong><p>Open Administration, select Administrator and use Institution B. Check the name and address, tick the confirmation, then authorise and save the name. Complete the records sign-in signature when prompted.</p><button className="text-button" onClick={() => setTab('admin')}>Go to administration</button></li><li><strong>Register and download the package</strong><p>Open Issuer workspace, select Institution B, choose the PDF and enter a private title. Verification data is backed up before the issuance transaction is submitted.</p><button className="text-button" onClick={() => setTab('issue')}>Go to issuer workspace</button></li><li><strong>Find records and recover packages</strong><p>Sign in on Credential records. Only the original issuer or an administrator can export saved verification data. Normal restarts preserve records and backups.</p><button className="text-button" onClick={() => setTab('documents')}>Go to credential records</button></li><li><strong>Rehearse with an independent wallet</strong><p>Open the local website in a browser with MetaMask, such as Chrome, and select Browser wallet. Get local test funds, ask the administrator to authorise your address, then register a credential. Verifiers do not need a wallet.</p></li></ol>
    <div className="guide-definitions"><h3>A few useful terms</h3><p><b>Credential ID: </b>A unique on-chain identifier. <b>salt: </b>A random verification value to keep with the original PDF. <b>Sign in: </b>Proves control of the wallet without spending gas. <b>Transaction confirmation: </b>Writes registration or revocation to the local chain, using test funds.</p><p><b>Normal shutdown: </b>Press Ctrl+C in the launch window and wait until it reports that it has stopped. <b>Reset: </b>Use the separate reset command and type its confirmation phrase to archive data and create a new environment. This differs from a normal restart.</p></div>
  </section>;
}
